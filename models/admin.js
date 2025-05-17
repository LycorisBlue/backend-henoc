'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Admin extends Model {
    static associate(models) {
      Admin.hasMany(models.Request, { foreignKey: 'assigned_admin_id', as: 'assigned_requests' });
      Admin.hasMany(models.Invoice, { foreignKey: 'admin_id', as: 'created_invoices' });
      Admin.hasMany(models.RequestStatusLog, { foreignKey: 'admin_id', as: 'status_logs' });
      Admin.hasMany(models.FeeType, { foreignKey: 'created_by', as: 'created_fee_types' });
    }
  }

  Admin.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
          isEmail: true
        }
      },
      password: {
        type: DataTypes.STRING,
        allowNull: false
      },
      role: {
        type: DataTypes.ENUM('admin', 'superadmin'),
        defaultValue: 'admin'
      }
    },
    {
      sequelize,
      modelName: 'Admin',
      tableName: 'admins',
      underscored: true,
      timestamps: true
    }
  );

  return Admin;
};
