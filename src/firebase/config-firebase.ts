import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";

// Inicializa Firebase Admin si no está inicializado
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../../firebase-admin.json"),
      "utf8"
    )
  );
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export default admin;