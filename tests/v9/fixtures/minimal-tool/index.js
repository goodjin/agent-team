export default {
  name: 'minimal-calc',
  description: 'adds two numbers',
  async execute(args) {
    return { sum: Number(args.a ?? 0) + Number(args.b ?? 0) };
  },
};
