const axios = require("axios");
const multer = require("multer");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");

// Setup multer for file uploads, storing them temporarily in the /tmp/ directory.
const upload = multer({ dest: "/tmp/" });

// Note: The original code had a 'module.exports = upload.any()' line here, which was being
// overwritten by the async function export below. This handler assumes the server
// environment (like Vercel or Netlify) automatically parses multipart/form-data bodies
// and populates `req.files` in a multer-compatible format.

module.exports = async (req, res) => {
  // ## CORS Headers ##
  // These headers are added to every response to allow cross-origin requests.
  // This is essential for allowing web applications from any domain to access this API.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );

  // ## Preflight Request Handling ##
  // Browsers send an 'OPTIONS' request before complex requests (like POST with JSON)
  // to check if the server allows it. We handle it here by sending back a success
  // status, indicating that the actual request can proceed.
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // ## API Logic ##
  try {
    // Extract the Telegram API method from the request URL (e.g., /api/sendMessage -> 'sendMessage')
    const method = req.url.split("/api/")[1]?.split("?")[0] || "getMe";

    // Load credentials from environment variables for security.
    const DEFAULT_BOT_TOKEN = process.env.BOT_TOKEN;
    const DEFAULT_CHAT_ID = process.env.DEFAULT_CHAT_ID;
    const query = req.query || {};

    // Allow overriding the BOT_TOKEN and CHAT_ID via request parameters for flexibility.
    const customToken = query.bot_token || req.body?.bot_token;
    const BOT_TOKEN = customToken || DEFAULT_BOT_TOKEN;
    const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
    const CHAT_ID = query.chat_id || req.body?.chat_id || DEFAULT_CHAT_ID;

    // --- Handle GET Requests ---
    if (req.method === "GET") {
      const params = { ...query };
      if (!params.chat_id && CHAT_ID) {
        params.chat_id = CHAT_ID;
      }
      // The bot_token is sensitive and should not be passed to Telegram as a parameter.
      delete params.bot_token;

      // Forward the GET request to the Telegram API.
      const { data } = await axios.get(`${TELEGRAM_API}/${method}`, { params });
      return res.status(200).json(data);
    }

    // --- Handle POST Requests ---

    // Case 1: Request contains files (multipart/form-data)
    if (req.files?.length > 0) {
      const form = new FormData();

      // Append each uploaded file to the new form data.
      req.files.forEach((file) => {
        const field = file.fieldname || "file";
        form.append(field, fs.createReadStream(file.path), file.originalname);
      });

      // Append all other text fields from the original body.
      for (const key in req.body) {
        if (key !== "bot_token" && key !== "chat_id") {
          form.append(key, req.body[key]);
        }
      }

      // Add the default chat_id if not already provided.
      if (!form.has("chat_id") && CHAT_ID) {
        form.append("chat_id", CHAT_ID);
      }

      // Post the complete form to the Telegram API.
      const { data } = await axios.post(`${TELEGRAM_API}/${method}`, form, {
        headers: form.getHeaders(),
      });
      
      // **Suggestion**: Clean up the temporary files after they are sent to prevent
      // the server from running out of storage space.
      req.files.forEach((file) => {
        fs.unlink(file.path, (err) => {
            if (err) console.error("Error deleting temp file:", file.path, err);
        });
      });

      return res.status(200).json(data);
    } 
    // Case 2: Request is a standard JSON body
    else {
      const payload = { ...req.body };
      if (!payload.chat_id && CHAT_ID) {
        payload.chat_id = CHAT_ID;
      }
      // The bot_token is sensitive and should not be part of the forwarded payload.
      delete payload.bot_token;

      // Post the JSON payload to the Telegram API.
      const { data } = await axios.post(`${TELEGRAM_API}/${method}`, payload, {
        headers: { "Content-Type": "application/json" },
      });

      return res.status(200).json(data);
    }
  } catch (error) {
    // ## Error Handling ##
    // Catches any errors during the process and returns a structured error message.
    console.error("API Proxy Error:", error?.response?.data || error.message);
    return res.status(error?.response?.status || 500).json({
      ok: false,
      error_message: "An internal server error occurred.",
      details: error?.response?.data || error.message,
    });
  }
};
