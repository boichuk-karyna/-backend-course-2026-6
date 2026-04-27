const { Command } = require("commander");

const program = new Command();

program
  .option("-n, --name <type>", "your name")
  .parse(process.argv);

const options = program.opts();

if (options.name) {
  console.log(`Hello, ${options.name}`);
} else {
  console.log("Hello, user");
}