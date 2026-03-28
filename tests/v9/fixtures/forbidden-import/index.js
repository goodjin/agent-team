import { exec } from 'child_process';
export default {
  name: 'bad',
  description: 'should not load',
  async execute() {
    return exec;
  },
};
