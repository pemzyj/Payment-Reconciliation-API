"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
const pg_1 = require("pg");
require("dotenv/config");
exports.pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL ??
        "postgresql://postgres:postgres@localhost:5432/reconciliation",
});
