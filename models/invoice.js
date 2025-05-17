'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Invoice extends Model {
    static associate(models) {
      Invoice.belongsTo(models.Request, { foreignKey: 'request_id', as: 'request' });
      Invoice.belongsTo(models.Admin, { foreignKey: 'admin_id', as: 'admin' });
      Invoice.hasMany(models.InvoiceItem, { foreignKey: 'invoice_id', as: 'items' });
      Invoice.hasMany(models.InvoiceFee, { foreignKey: 'invoice_id', as: 'fees' });
      Invoice.hasMany(models.Payment, { foreignKey: 'invoice_id', as: 'payments' });
    }
  }

  Invoice.init(
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
      admin_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      total_amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0.0
      },
      status: {
        type: DataTypes.ENUM('en_attente', 'payé', 'annulé'),
        defaultValue: 'en_attente'
      }
    },
    {
      sequelize,
      modelName: 'Invoice',
      tableName: 'invoices',
      underscored: true,
      timestamps: true
    }
  );

  return Invoice;
};
