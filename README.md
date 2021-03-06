# hapi-moleculer
[![npm version](https://badge.fury.io/js/hapi-moleculer.svg)](https://badge.fury.io/js/hapi-moleculer)
[![Build Status](https://travis-ci.com/felipegcampos/hapi-moleculer.svg?branch=master)](https://travis-ci.com/felipegcampos/hapi-moleculer)
[![codecov](https://codecov.io/gh/felipegcampos/hapi-moleculer/branch/master/graph/badge.svg)](https://codecov.io/gh/felipegcampos/hapi-moleculer)

![Hapi plugin for the Moleculer Microservices Framework](./assets/header.png)

[Hapi](https://hapijs.com/) plugin for the [Moleculer Microservices Framework](http://moleculer.services/).

## Install

    npm i hapi-moleculer --save

or

    yarn add hapi-moleculer

## Usage
```javascript
'use strict'

const  Hapi  =  require('hapi');
const  HapiMoleculer  =  require('hapi-moleculer');
const { ServiceBroker } =  require('moleculer');

(async  function() {
	// Create a server
	const  server  =  new  Hapi.Server({
		host:  'localhost',
		port:  3000,
	});

	// Register the plugin
	await  server.register({
		plugin: HapiMoleculer, 
		options: {
			// broker config object or ServiceBroker instance
			broker: {
				namespace:  'my-namespace',
				logger:  true,
				logLevel:  'info',
			},
			aliases: [{
				method:  'REST',
				path:  '/users',
				action:  'users',
				routeOpts: {
					// Add tags in all routes
					all: {
						tags: ['api', 'user'],
					},
					// Add properties only for list endpoint ( /user/list )
					list: {
						description:  'list all users',
					},
				},
			}, {
				method:  'POST',
				path:  '/user/login',
				action:  'users.login',
				routeOpts: {
					description:  'user login',
					tags: ['api', 'user'],
					// Turn the authentication off for this route ( supposing you have it enabled for all routes )
					auth:  false,
					// Add custom validation
					validate: {
						payload:  Joi.object({
							user:  Joi.object({
								username:  Joi.string().required(),
								password:  Joi.string().required(),
							}).required(),
						}),
					},
				},
			}],
		},
	});
	
	// Starting server
	server.start();
}());
```

## API

 - [Options](#options)
 - [Decorations](#decorations)
 - [Context](#context)
 

### Options

 - `name` - **(optional)** Service name that will be used to create the context action names. Default to `api`.
 - `broker` - **(optional)** Either a ServiceBroker seeting object or a [ServiceBroker](http://moleculer.services/0.12/api/service-broker.html#ServiceBroker) instance. Default to `{}`. Eg:
 ```javascript
// Register the plugin
await  server.register({
	plugin: HapiMoleculer,
	options: {
		broker: {
			namespace:  'my-namespace',
			logger:  true,
			logLevel:  'info',
		}
	}
);

// or

const broker = new ServiceBroker({
	namespace:  'my-namespace',
	logger:  true,
	logLevel:  'info',
});
await  server.register({ plugin, options: { broker });
 ```

 - `aliases` - **(optional)** Array of alias objects where:
	 - `method` - **(optional)** Either a string / array of strings representing the method name within ( `GET`, `POST`, `UPDATE`, `DELETE`, `PATCH`, `OPTIONS` ) or a single option within ( `REST`, `*` ). Use `*` to match against any HTTP method. `REST` will create all RESTful paths ( *get*, *list*, *create*, *update* and *remove* ) for the action.  Default to `*`. Eg.: 
		 ```javascript
		 [{ method: 'REST', path: '/user', action: 'users'}]
		
		// same as
		
		[
			{ method: 'GET', path: '/user/{id}', action: 'users.get'},
			{ method: 'GET', path: '/user', action: 'users.list'},
			{ method: 'POST', path: '/user', action: 'users.creare'},
			{ method: 'PUT', path: '/user/{id}', action: 'users.update'},
			{ method: 'DELETE', path: '/user/{id}', action: 'users.remove'}
		]
		```
		> To use REST shorthand alias you need to create a service which has
		> `list`, `get`, `create`, `update` and `remove` actions.

	 - `path` - **(required)** the absolute path used to match incoming requests ( *must begin with '/'* ).
	 - `action` - **(required)** Moleculer [action](http://moleculer.services/0.12/docs/service.html#Actions) name.
	 - `blacklist` - **(optional)** A list of actions that will be cut out from the RESTful paths. Valid values: `list`, `get`, `create`, `update` and `remove`. **Only valid if `method` is `REST`**. Eg.:
	```javascript
	[{
		method: 'REST',
		path: '/user',
		action: 'users',
		// it will create just list, get and remove
		blacklist: ['create', 'update']
	}]
	```
	 - `routeOpts` - **(optional)** additional [route options](https://hapijs.com/api#route-options). When the method name is equal to `REST` the routeOpts has all 5 RESTful options plus one `all` properties:
		 ```javascript
		[{
			method: 'POST',
			path: '/users/login',
			action: 'users.login',
			routeOpts: {
				// route options here
			},
		},{
			method: 'REST',
			path: '/user',
			action: 'users',
			routeOpts: {
				all: { // route options here },
				get: { // route options here },
				list: { // route options here },
				create: { // route options here },
				update: { // route options here },
				delete: { // route options here },
			},
		 }]
		```
		> Assign values in the following order: **inner default opts**, **routeOpts.all** and **routeOpts.[actionType]** using [lodash.assign](https://lodash.com/docs/4.17.10#assign).

### Decorations

**hapi-moleculer** decorates the Hapi server and request with `server.broker` and `request.broker` which is the instance of the [ServiceBroker](http://moleculer.services/0.12/api/service-broker.html#ServiceBroker) created in the register function. It can be used to call the actions in the route handler, plugins, etc. Eg.:
```javascript
const route = {
	method: 'POST',
	path: '/user/logout',
	options: {
		validate: {
			headers:  Joi.object({
				authorization:  Joi.string().regex(/^Token [A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/=]*$/).required(),
			}).options({ allowUnknown:  true }),
		}
	},
	handler:  async  function  logout(request) {
		const { token } =  request.auth.credentials;
		return  request.broker.call('users.logout', { token });
	},
};
```

### Context

**hapi-moleculer** creates a [Moleculer Context](http://moleculer.services/0.12/api/context.html) to wrap the call in every request. It uses the [Hapi request lifecyle workflow](https://hapijs.com/api#lifecycle-workflow) to first create the Context in the `onPreAuth` step and then set the params in the `onPreHandler` step. The context can be accessed with `request.ctx`. Hence, you can use it to set the `ctx.meta` in the autencation step or any other step you need. Eg.:
```javascript
"use strict";

const Bcrypt = require("bcrypt");
const Hapi = require("hapi");

const users = {
  john: {
    username: "john",
    password: "$2a$10$iqJSHD.BGr0E2IxQwYgJmeP3NvhPrXAeLSaGCj6IR/XU5QtjVu5Tm", // 'secret'
    name: "John Doe",
    id: "2133d32a"
  }
};

const validate = async (request, username, password) => {
  const user = users[username];
  if (!user) {
    return { credentials: null, isValid: false };
  }

  const isValid = await Bcrypt.compare(password, user.password);
  const credentials = { id: user.id, name: user.name };

  // Set the meta if the credentials are valid.
  if (isValid) {
    request.ctx.meta.credentials = credentials;
  }

  return { isValid, credentials };
};

const start = async () => {
  const server = Hapi.server({ port: 4000 });

	await server.register(require("hapi-auth-basic"));
	await server.register(require("hapi-moleculer"));

  server.auth.strategy("simple", "basic", { validate });

  server.route({
    method: "GET",
    path: "/",
    options: {
      auth: "simple"
    },
    handler: function(request, h) {
      return "welcome";
    }
  });

  await server.start();

  console.log("server running at: " + server.info.uri);
};

start();
```

## License

ISC
