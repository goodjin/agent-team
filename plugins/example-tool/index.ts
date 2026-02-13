export const name = 'text_uppercase';
export const description = 'Converts input text to uppercase';
export async function execute(args: { text: string }): Promise<{ result: string }> {
  return { result: args.text.toUpperCase() };
}
