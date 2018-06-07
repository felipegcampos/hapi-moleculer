'use strict';

const Joi = require('joi');
const Boom = require('boom');
const _ = require('lodash');
const pkg = require('../package.json');
const { Context, ServiceBroker } = require('moleculer');
const internals = {};

// All actions the REST method can have
internals.restActions = ['get', 'list', 'create', 'update', 'remove'];

// Default route options schema
internals.routeOptsSchema = Joi.object().default({});

// Plugin options schema
internals.schema = Joi.object({
  name: Joi.string()
    .trim()
    .default('api'),
  broker: Joi.alternatives()
    .try(Joi.object().type(ServiceBroker), Joi.object())
    .default({}),
  aliases: Joi.array().items(
    Joi.object().keys({
      method: Joi.alternatives()
        .try(
          Joi.string()
            .only('REST', '*')
            .uppercase(),
          Joi.array()
            .items(
              Joi.string().only(
                'POST',
                'GET',
                'PUT',
                'DELETE',
                'PATCH',
                'OPTIONS'
              )
            )
            .single()
        )
        .default('*'),
      path: Joi.string()
        .regex(/^\/.*$/)
        .notes('must begin with /')
        .required(),
      action: Joi.string().required(),
      blacklist: Joi.alternatives().when('method', {
        is: 'REST',
        then: Joi.array()
          .items(Joi.string().allow(internals.restActions))
          .unique(),
        otherwise: Joi.forbidden(),
      }),
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
    handler: async (request, h) => {
      const params = _.assign(
        {},
        request.payload,
        request.params,
        request.query
      );
      const resp = await request.ctx.call(action, params);
      // Hapi handler must return a value
      if (!resp) {
        return h.response('').code(200);
      }
      return resp;
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
      id: Joi.alternatives()
        .try(Joi.string(), Joi.number())
        .required(),
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
      _.assign(defaultRouteOpts, { validate: paramValidation });
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
    /* $lab:coverage:off$ */
    default:
      method = 'GET';
      break;
    /* $lab:coverage:on$ */
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
 * Create Moleculer Context
 *
 * @param {Object} request   request object (https://hapijs.com/api#request)
 * @param {Object} h         response toolkit (https://hapijs.com/api#response-toolkit)
 */
internals.onPreAuth = async function(request, h) {
  const method = request.method.toLowerCase();
  const action = {
    name: `${this.name}.${method}`,
  };

  request.ctx = Context.create(
    request.broker,
    action,
    request.broker.nodeID,
    request.params,
    {}
  );

  return h.continue;
};

/**
 * Update context params
 *
 * @param {Object} request   request object (https://hapijs.com/api#request)
 * @param {Object} h         response toolkit (https://hapijs.com/api#response-toolkit)
 */
internals.onPreHandler = async (request, h) => {
  const params = _.assign({}, request.payload, request.params, request.query);
  request.ctx.setParams(params);
  return h.continue;
};

/**
 * Handler the errors from Moleculer.
 *
 * @param {Object} request   request object (https://hapijs.com/api#request)
 * @param {Object} h         response toolkit (https://hapijs.com/api#response-toolkit)
 */
internals.onPreResponse = async (request, h) => {
  const { response } = request;
  if (response.isBoom && response.code) {
    return new Boom(response.message, {
      statusCode: response.code,
      data: response.data,
    });
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
  const opts = Joi.attempt(
    options,
    internals.schema,
    'Invalid hapi-moleculer options'
  );

  let broker;
  if (opts.broker instanceof ServiceBroker) {
    broker = opts.broker;
  } else {
    broker = new ServiceBroker(opts.broker);
  }

  if (!_.isNil(opts.aliases) && !_.isEmpty(opts.aliases)) {
    const { createRoute, normalizeAlias } = internals;
    const routes = [];
    _.each(opts.aliases, alias => {
      if (alias.method === 'REST') {
        const blacklist = alias.blacklist || [];
        const actions = _.without(internals.restActions, ...blacklist);
        _.forEach(actions, action => {
          routes.push(createRoute(normalizeAlias(action, alias)));
        });
      } else {
        routes.push(createRoute(alias));
      }
    });
    server.route(routes);
  }

  server.ext('onPreAuth', internals.onPreAuth, { bind: { name: opts.name } });
  server.ext('onPreHandler', internals.onPreHandler);
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
