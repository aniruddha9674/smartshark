import dotenv from "dotenv";
dotenv.config();

console.log("Raw value:", JSON.stringify(process.env.BRANDFETCH_CLIENT_ID));
console.log("Length:", process.env.BRANDFETCH_CLIENT_ID?.length);
console.log("Type:", typeof process.env.BRANDFETCH_CLIENT_ID);