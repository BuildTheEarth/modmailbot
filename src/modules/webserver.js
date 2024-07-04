const express = require("express");
const cors = require('cors') 
const helmet = require("helmet");
const mime = require("mime");
const url = require("url");
const fs = require("fs");
const qs = require("querystring");
const moment = require("moment");
const config = require("../cfg");
const threads = require("../data/threads");
const attachments = require("../data/attachments");
const { formatters } = require("../formatters");
const knex = require("../knex");

function notfound(res) {
  res.status(404).send("Page Not Found");
}

/**
 * @param {express.Request} req
 * @param {express.Response} res
 */
async function serveLogs(req, res) {
  const thread = await threads.findById(req.params.threadId);
  if (! thread) return notfound(res);

  let threadMessages = await thread.getThreadMessages();

  const formatLogResult = await formatters.formatLog(thread, threadMessages, {
    simple: Boolean(req.query.simple),
    verbose: Boolean(req.query.verbose),
  });

  const contentType = formatLogResult.extra && formatLogResult.extra.contentType || "text/plain; charset=UTF-8";

  res.set("Content-Type", contentType);
  res.send(formatLogResult.content);
}

function serveAttachments(req, res) {
  if (req.params.attachmentId.match(/^[0-9]+$/) === null) return notfound(res);
  if (req.params.filename.match(/^[0-9a-z._-]+$/i) === null) return notfound(res);

  const attachmentPath = attachments.getLocalAttachmentPath(req.params.attachmentId);
  fs.access(attachmentPath, (err) => {
    if (err) return notfound(res);

    const filenameParts = req.params.filename.split(".");
    const ext = (filenameParts.length > 1 ? filenameParts[filenameParts.length - 1] : "bin");
    const fileMime = mime.getType(ext);

    res.set("Content-Type", fileMime);

    const read = fs.createReadStream(attachmentPath);
    read.pipe(res);
  })
}

async function serveTickets(req, res) {
  res.type("application/json");

  const openOnly = req.query.open ? true: false

  const closedOnly = req.query.closed ? true: false

  if (openOnly && closedOnly) {
    res.status(400).send({ error: "MALFORMED_INPUT", message: "Cannot have both open and closed parameters" })
    return
  }

  let query = knex("threads")
      .orderBy("thread_number", "DESC")
    
  if (openOnly)  query = query.where("status", 1)

  if (closedOnly)  query = query.where("status", 2)
  
  const result = await query.select()

  res.status(200).send(result)
  return 

}

async function serveTicketStats(req, res) {
  res.type("application/json");

  let query = knex("threads")
    .select('status')
    .count('id', { as: 'count' })
    .groupBy('status')
  
  const result = await query.select()

  res.status(200).send(result)
  return 


}

const server = express();
server.use(helmet({
  frameguard: false
}));
server.use(cors()); 

server.get("/logs/:threadId", serveLogs);
server.get("/attachments/:attachmentId/:filename", serveAttachments);
server.get("/api/v1/tickets", serveTickets)
server.get("/api/v1/ticketStats", serveTicketStats)
//here

server.on("error", err => {
  console.log("[WARN] Web server error:", err.message);
});

module.exports = server;
