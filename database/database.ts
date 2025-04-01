import { Sequelize } from "sequelize";

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: "./database/database.sqlite",
  logging: false,
});

export default sequelize;