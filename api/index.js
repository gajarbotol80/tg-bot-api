const axios = require("axios");
const multer = require("multer");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");

const upload = multer({ dest: "/tmp/" });

module.exports = upload.any();

module.exports = async (req, res) => {
  const method = req.url.split("/api/")[1]?.split("?")[0] || "getMe";

  const DEFAULT_BOT_TOKEN = process.env.BOT_TOKEN;
  const DEFAULT_CHAT_ID = process.env.DEFAULT_CHAT_ID;
  const query = req.query || {};

  const customToken = query.bot_token || req.body?.bot_token;
  const BOT_TOKEN = customToken || DEFAULT_BOT_TOKEN;
  const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

  const CHAT_ID = query.chat_id || req.body?.chat_id || DEFAULT_CHAT_ID;

  try {
    if (req.method === "GET") {
      const params = { ...query };
      if (!params.chat_id && CHAT_ID) {
        params.chat_id = CHAT_ID;
      }
      delete params.bot_token;

      const { data } = await axios.get(`${TELEGRAM_API}/${method}`, { params });
      return res.status(200).json(data);
    }

    // Handle JSON or multipart body
    if (req.files?.length > 0) {
      const form = new FormData();
      req.files.forEach((file) => {
        const field = file.fieldname || "file";
        form.append(field, fs.createReadStream(file.path), file.originalname);
      });

      for (const key in req.body) {
        if (key !== "bot_token" && key !== "chat_id") {
          form.append(key, req.body[key]);
        }
      }

      if (!form.has("chat_id") && CHAT_ID) {
        form.append("chat_id", CHAT_ID);
      }

      const { data } = await axios.post(`${TELEGRAM_API}/${method}`, form, {
        headers: form.getHeaders(),
      });

      return res.status(200).json(data);
    } else {
      const payload = { ...req.body };
      if (!payload.chat_id && CHAT_ID) {
        payload.chat_id = CHAT_ID;
      }
      delete payload.bot_token;

      const { data } = await axios.post(`${TELEGRAM_API}/${method}`, payload, {
        headers: { "Content-Type": "application/json" },
      });

      return res.status(200).json(data);
    }
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.response?.data || error.message,
    });
  }
};
