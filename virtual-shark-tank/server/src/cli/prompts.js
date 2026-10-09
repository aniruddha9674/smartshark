import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export const createPrompt = () => {
  const rl = readline.createInterface({ input, output });
  return {
    ask: (question) => rl.question(question),
    close: () => rl.close(),
  };
};

export const promptChoice = async (rl, question, choices) => {
  const hint = choices.map((c) => `[${c}]`).join("/");
  while (true) {
    const answer = (await rl.question(`${question} ${hint} `))
      .trim()
      .toLowerCase();
    if (choices.includes(answer)) return answer;
    console.log(`  Please enter one of: ${choices.join(", ")}`);
  }
};