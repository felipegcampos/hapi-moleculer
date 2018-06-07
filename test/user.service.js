module.exports = {
  name: 'user',
  actions: {
    login() {
      return 'User logged in';
    },
    me(ctx) {
      return `Check me ${ctx.params.name}`;
    },
    create() {
      return 'Create user';
    },
    get(ctx) {
      return `Get user ${ctx.params.id}`;
    },
    list() {
      return 'List users';
    },
    update(ctx) {
      return `Update user ${ctx.params.id}`;
    },
    remove(ctx) {
      return `Remove user ${ctx.params.id}`;
    },
    context(ctx) {
      return `User context ${ctx.meta.userId}`;
    },
    noret() {
      // do smth here and do not return
    },
  },
};
