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
    confidential: {
      visibility: 'public',
      handler(ctx) {
        return 'Confidential!';
      },
    },
    noret() {
      // do smth here and do not return
    },
    nostatuserror() {
      throw new Error("It's a no status error.");
    },
  },
};
