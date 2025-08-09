const OpenAI = require("openai");

const openai = new OpenAI();

const MODEL_PARAMS = {
  model: "gpt-5",
};

async function genResponse(request) {
  console.log("** REQUEST **");
  console.log(request);

  const response = await openai.responses.create({
    ...MODEL_PARAMS,
    input: `Using authoritative sources like IcyVeins, Wowhead, Maxroll.gg or Method, answer the following request for World of Warcraft - The War Within Season 3 (Patch 11.2): ${request}. You are allowed to fetch any relevant pages. Do not ask any follow-up questions. Explain any differences in recommendations for Raid or Mythic+. Be relatively concise. There is no need to provide your sources.`
  });

  const message = response.output_text;
  console.log("** RESPONSE **");
  console.log(response);

  return message;
}

module.exports = {
  genResponse
};
