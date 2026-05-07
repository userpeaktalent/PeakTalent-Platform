import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Load .env.local manually
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, ".env.local");

console.log("Starting script...");

let apiKey = "";
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    const match = envContent.match(/GEMINI_API_KEY=(.*)/);
    if (match) {
        apiKey = match[1].trim();
        console.log("API Key found.");
    } else {
        console.log("API Key NOT found in .env.local");
    }
} else {
    console.log(".env.local NOT found at " + envPath);
}

if (!apiKey) {
    console.error("No API Key.");
    process.exit(1);
}

async function listModels() {
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        console.log("Fetching from " + url.replace(apiKey, "HIDDEN"));

        // Use dynamic import for fetch if needed? No, node 18+ has global fetch.
        // Ensure we catch fetch errors distinctly.
        let response;
        try {
            response = await fetch(url);
        } catch (fetchError) {
            console.error("Fetch failed:", fetchError);
            fs.writeFileSync('models_debug_error.txt', "Fetch failed: " + fetchError.message);
            return;
        }

        if (!response.ok) {
            console.error("Response not OK:", response.status, response.statusText);
            const text = await response.text();
            fs.writeFileSync('models_debug_error.txt', `HTTP ${response.status}: ${text}`);
            return;
        }

        const data = await response.json();
        console.log("Data received. Writing to models_final.json");

        fs.writeFileSync('models_final.json', JSON.stringify(data, null, 2));
        console.log("Success.");

    } catch (error) {
        console.error("Error in listModels:", error);
        fs.writeFileSync('models_debug_error.txt', "General Error: " + error.message);
    }
}

listModels();
