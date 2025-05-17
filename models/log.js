'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Log extends Model {
    static associate(models) {
      Log.belongsTo(models.Admin, { foreignKey: 'admin_id', as: 'admin' });
    }
  }

  Log.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      source: {
        type: DataTypes.STRING,
        allowNull: false
      },
      admin_id: {
        type: DataTypes.UUID,
        allowNull: true
      },
      action: {
        type: DataTypes.STRING,
        allowNull: false
      },
      ip_address: {
        type: DataTypes.STRING,
        allowNull: true
      },
      request_data: {
        type: DataTypes.JSON,
        allowNull: true
      },
      response_data: {
        type: DataTypes.JSON,
        allowNull: true
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false
      },
      environment: {
        type: DataTypes.STRING,
        allowNull: true
      },
      device_info: {
        type: DataTypes.JSON,
        allowNull: true
      }
    },
    {
      sequelize,
      modelName: 'Log',
      tableName: 'logs',
      underscored: true,
      timestamps: true
    }
  );

  return Log;
};
