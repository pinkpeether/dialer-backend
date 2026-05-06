const express = require("express");
const VoiceResponse = require("twilio").twiml.VoiceResponse;

const app = express();

app.use(express.urlencoded({ extended: false }));

app.post("/voice", (req, res) => {
  const twiml = new VoiceResponse();
  twiml.say("Hello! Your custom dialer is working.");
  res.type("text/xml");
  res.send(twiml.toString());
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});