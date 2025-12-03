require('dotenv').config(); // Loads .env for local development

module.exports = {
    development: {
        client: 'pg',
        connection: {
            host: 'localhost',
            user: 'postgres',
            password: 'admin',
            database: 'ellarises',
            port: 5432,
        },
        migrations: {
            directory: './migrations'
        }
    },

    production: {
        client: 'pg',
        connection: {
            host: process.env.RDS_HOSTNAME,
            user: process.env.RDS_USERNAME,
            password: process.env.RDS_PASSWORD,
            database: process.env.RDS_DB_NAME,
            port: process.env.RDS_PORT || 5432,
            ssl: { rejectUnauthorized: false }
        },
        migrations: {
            directory: './migrations'
        }
    }
};