'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class RequestStatusLog extends Model {
    static associate(models) {
      RequestStatusLog.belongsTo(models.Request, { foreignKey: 'request_id', as: 'request' });
      RequestStatusLog.belongsTo(models.Admin, { foreignKey: 'admin_id', as: 'admin' });
    }
  }

  RequestStatusLog.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      request_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      previous_status: {
        type: DataTypes.STRING,
        allowNull: true
      },
      new_status: {
        type: DataTypes.STRING,
        allowNull: false
      },
      comment: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      admin_id: {
        type: DataTypes.UUID,
        allowNull: true
      }
    },
    {
      sequelize,
      modelName: 'RequestStatusLog',
      tableName: 'request_status_logs',
      underscored: true,
      timestamps: true
    }
  );

  return RequestStatusLog;
};
