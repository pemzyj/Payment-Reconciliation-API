"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const client_1 = require("./client");
async function migrate() {
    const dir = node_path_1.default.join(__dirname, "migrations");
    const files = node_fs_1.default.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
        const sql = node_fs_1.default.readFileSync(node_path_1.default.join(dir, file), "utf-8");
        console.log(`Applying ${file}...`);
        await client_1.pool.query(sql);
    }
    console.log("Migrations complete.");
    await client_1.pool.end();
}
migrate().catch((err) => {
    console.error("Migration failed:", err.message);
    process.exit(1);
});
