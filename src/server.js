import app from "./app.js";
import connectDB from "./config/db.js";
import { env, validateEnv } from "./config/env.js";

const startServer = async () => {
  validateEnv();
  await connectDB();

  app.listen(env.port, () => {
    console.log(`Server running on port ${env.port}`);
  });
};

startServer().catch((error) => {
  console.error("Failed to start server:", error.message);
  process.exit(1);
});
