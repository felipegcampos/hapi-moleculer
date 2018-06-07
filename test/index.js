'use strict'

const { expect } = require('code')
const Lab = require('lab')
const lab = exports.lab = Lab.script()
const Hapi = require('hapi')
const Joi = require('joi')
const { ServiceBroker } = require('moleculer')
const HapiMoleculer = require('../lib')

const setup = async () => {
  const server = new Hapi.Server()

  const broker = new ServiceBroker()
  broker.loadService('./test/user.service')

  await server.register({
    plugin: HapiMoleculer,
    options: {
      broker,
      aliases: [{
        method: 'POST',
        path: '/user/login',
        action: 'user.login'
      }, {
        method: 'POST',
        path: '/user/context',
        action: 'user.context',
        routeOpts: {
          validate: {
            query: {
              name: Joi.string().default('Felipe')
            }
          },
          pre: [
            (request, h) => {
              request.ctx.meta.userId = 123456
              return h.continue
            }
          ]
        }
      }, {
        method: 'GET',
        path: '/user/noret',
        action: 'user.noret'
      }, {
        method: 'REST',
        path: '/users',
        action: 'user'
      }, {
        method: 'GET',
        path: '/user/me',
        action: 'user.me',
        routeOpts: {
          validate: {
            query: {
              name: Joi.string().required()
            }
          }
        }
      }, {
        method: 'REST',
        path: '/rest',
        action: 'user',
        routeOpts: {
          all: {
            description: 'Rest description'
          },
          create: {
            description: 'Overwritten description'
          }
        }
      }, {
        method: 'REST',
        path: '/blacklist',
        action: 'user',
        blacklist: ['create', 'update']
      }, {
        method: 'GET',
        path: '/error',
        action: 'test'
      }]
    }
  })

  return server
}

lab.experiment('HapiMoleculer', () => {
  lab.experiment('broker options object', () => {
    let server = null

    lab.before(async () => {
      server = new Hapi.Server()
      await server.register({
        plugin: HapiMoleculer,
        options: {
          broker: {
            namespace: 'testnmsp'
          }
        }
      })
    })

    lab.test('should decorate server', () => {
      const { decorations } = server
      expect(decorations.request).contains('broker')
      expect(decorations.server).contains('broker')
    })

    lab.test('should be defined', () => {
      expect(server.broker).to.be.instanceof(ServiceBroker)
    })
  })

  lab.experiment('broker instance', () => {
    let server = null

    lab.before(async () => {
      server = await setup()
    })

    lab.experiment('plugin', () => {
      lab.test('should decorate server', () => {
        const { decorations } = server
        expect(decorations.request).contains('broker')
        expect(decorations.server).contains('broker')
      })

      lab.test('should be defined', () => {
        expect(server.broker).to.be.instanceof(ServiceBroker)
      })
    })

    lab.experiment('single alias', () => {
      lab.test('should fail with wrong method', async () => {
        const res = await server.inject('/user/login')

        expect(res.statusCode).to.equal(404)
      })

      lab.test('should return success', async () => {
        const res = await server.inject({ url: '/user/login', method: 'POST' })

        expect(res.statusCode).to.equal(200)
        expect(res.result).to.equal('User logged in')
      })

      lab.test('should use route options', async () => {
        const res = await server.inject('/user/me')

        expect(res.statusCode).to.equal(400)
        expect(res.statusMessage).to.equal('Bad Request')
      })

      lab.test('should return success status if no return from action', async () => {
        const res = await server.inject('/user/noret')

        expect(res.statusCode).to.equal(200)
        expect(res.result).to.equal('')
      })
    })

    lab.experiment('rest alias', () => {
      lab.test('should execute get action', async () => {
        const res = await server.inject({ url: '/users/123456', method: 'GET' })

        expect(res.statusCode).to.equal(200)
        expect(res.result).to.equal('Get user 123456')
      })

      lab.test('should execute list action', async () => {
        const res = await server.inject({ url: '/users', method: 'GET' })

        expect(res.statusCode).to.equal(200)
        expect(res.result).to.equal('List users')
      })

      lab.test('should execute update action', async () => {
        const res = await server.inject({ url: '/users/123456', method: 'PUT' })

        expect(res.statusCode).to.equal(200)
        expect(res.result).to.equal('Update user 123456')
      })

      lab.test('should execute remove action', async () => {
        const res = await server.inject({ url: '/users/123456', method: 'DELETE' })

        expect(res.statusCode).to.equal(200)
        expect(res.result).to.equal('Remove user 123456')
      })

      lab.test('should execute create action', async () => {
        const res = await server.inject({ url: '/users', method: 'POST' })

        expect(res.statusCode).to.equal(200)
        expect(res.result).to.equal('Create user')
      })

      lab.test('should use \'all\' route options', async () => {
        const res = await server.inject({ url: '/rest/12345', method: 'GET' })

        expect(res.request.route.settings.description).to.exists()
        expect(res.request.route.settings.description).to.equal('Rest description')
      })

      lab.test('should use specific route options', async () => {
        const res = await server.inject({ url: '/rest', method: 'POST' })

        expect(res.request.route.settings.description).to.exists()
        expect(res.request.route.settings.description).to.equal('Overwritten description')
      })

      lab.test('should fail to access blacklisted route', async () => {
        const res = await server.inject({ url: '/blacklist', method: 'POST' })

        expect(res.statusCode).to.equal(404)
      })

      lab.test('should access non-blacklisted route', async () => {
        const res = await server.inject({ url: '/blacklist', method: 'GET' })

        expect(res.statusCode).to.equal(200)
        expect(res.result).to.equal('List users')
      })
    })

    lab.experiment('moleculer context', () => {
      lab.test('should create context', async () => {
        const res = await server.inject({ url: '/user/context', method: 'POST' })

        expect(res.statusCode).to.equal(200)
        expect(res.result).to.equal('User context 123456')
      })
    })

    lab.experiment('errors', () => {
      lab.test('should bomify moleculer error', async () => {
        const res = await server.inject('/error')

        expect(res.statusCode).to.equal(404)
        expect(res.result).to.exist()
        expect(res.result.statusCode).to.equal(404)
        expect(res.result.error).to.equal('Not Found')
        expect(res.result.message).to.equal('Service \'test\' is not found.')
      })
    })
  })
})
