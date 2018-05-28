'use strict';

const Joi = require('joi');
const Boom = require('boom');
const _ = require('lodash');
const pkg = require('./package.json');
const { ServiceBroker } = require('moleculer');
const internals = {};

// Default route options schema
internals.routeOptsSchema = Joi.object().default({});

// Plugin options schema
internals.schema =  Joi.object({
    broker: Joi.alternatives().try(Joi.object().type(ServiceBroker), Joi.object().min(1)).required(),
    aliases: Joi.array().items(
        Joi.object().keys({
            method: Joi.alternatives().try(
                Joi.string().only('REST', '*').uppercase(),
                Joi.array().items(Joi.string().only('POST', 'GET', 'PUT', 'DELETE', 'PATCH', 'OPTIONS')).single()
            ).default('*'),
            path: Joi.string().regex(/^\/.*$/).notes('must begin with /').required(),
            action: Joi.string().required(),
            routeOpts: Joi.alternatives().when('method', {
                is: 'REST',
                then: Joi.object().keys({
                    all: internals.routeOptsSchema,
                    get: internals.routeOptsSchema,
                    list: internals.routeOptsSchema,
                    create: internals.routeOptsSchema,
                    update: internals.routeOptsSchema,
                    remove: internals.routeOptsSchema,
                }),
                otherwise: internals.routeOptsSchema,
            }),
        })
    ),
});

/**
 * Create Hapi route
 * 
 * @param {Object} alias Normalized alias object
 */
internals.createRoute = ({ method, path, action, routeOpts }) => {
    return {
        method,
        path,
        options: routeOpts,
        handler: async (request) => {
            const params = _.assign({}, request.payload, request.params, request.query);
            return request.broker.call(action, params);
        },
    };
};

/**
 * Normalize rest model alias
 * 
 * @param {String} type     One of list, get, update, remove or create
 * @param {Object} alias    Alias object from options
 */
internals.normalizeAlias = (type, alias) => {
    const defaultRouteOpts = {};
    const paramValidation = {
        params: {
            id: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
        },
    };
    
    let method;
    let { path } = alias;
    switch (type) {
        case 'list':
                method = 'GET';
            break;
        case 'get':
                method = 'GET';
                path = `${path}/{id}`;
                _.assign(defaultRouteOpts, {
                    validate: paramValidation,
                });
            break;
        case 'update':
                method = 'PUT';
                path = `${path}/{id}`;
                _.assign(defaultRouteOpts, { validate: paramValidation });
            break;
        case 'remove':
                method = 'DELETE';
                path = `${path}/{id}`;
                _.assign(defaultRouteOpts, { validate: paramValidation });
            break;
        case 'create':
                method = 'POST';
            break;
        default:
                method = 'GET';
            break;
    }
    const action = `${alias.action}.${type}`;
    const routeOpts = _.assign(
        defaultRouteOpts,
        _.get(alias, `routeOpts.all`, {}),
        _.get(alias, `routeOpts.${type}`, {})
    );

    return { method, path, action, routeOpts };
};

/**
 * Handler the errors from Moleculer.
 * 
 * @param {Object} request   request object (https://hapijs.com/api#request)
 * @param {Object} h         response toolkit (https://hapijs.com/api#response-toolkit)
 */
internals.onPreResponse = async (request, h) => {
    const { response } = request;
    if (response.isBoom) {
        if (response.code) {
            return new Boom(response.message, {
                statusCode: response.code,
                data: response.data,
            });
        }

        return Boom.boomify(response);
    }
    return h.continue;
};

/**
 * Plugin register function ( https://hapijs.com/api#plugins )
 * 
 * @param {*} server         the server object with a plugin-specific server.realm
 * @param {Object} options   any options passed to the plugin during registration via server.register()
 */
internals.register = async (server, options) => {
    const opts = Joi.attempt(options, internals.schema, 'Invalid hapi-moleculer options');

    let broker;
    if (opts.broker instanceof ServiceBroker) {
        broker = opts.broker;
    } else {
        broker = new ServiceBroker(opts.broker);
    }

    if (!_.isNil(opts.aliases) && !_.isEmpty(opts.aliases)) {
        const { createRoute, normalizeAlias } = internals;
        const routes = [];
        _.each(opts.aliases, (alias) => {
            if (alias.method === 'REST') {
                routes.push(createRoute(normalizeAlias('get', alias)));
                routes.push(createRoute(normalizeAlias('list', alias)));
                routes.push(createRoute(normalizeAlias('create', alias)));
                routes.push(createRoute(normalizeAlias('update', alias)));
                routes.push(createRoute(normalizeAlias('remove', alias)));
            } else {
                routes.push(createRoute(alias));
            }
        });
        server.route(routes);
    }

    server.ext('onPreResponse', internals.onPreResponse);

    server.decorate('server', 'broker', broker);
    server.decorate('request', 'broker', broker);

    await broker.start();
};

module.exports = {
    name: 'hapi-moleculer',
    register: internals.register,
    pkg,
};
