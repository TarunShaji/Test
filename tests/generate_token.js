const jwt = require('jsonwebtoken');
require('dotenv').config();

const secret = process.env.JWT_SECRET;
const payload = {
    id: "test-user-id",
    name: "Verification Tester",
    role: "Admin"
};

const token = jwt.sign(payload, secret, { expiresIn: '1h' });
console.log(token);
