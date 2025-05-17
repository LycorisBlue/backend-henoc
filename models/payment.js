'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Payment extends Model {
    static associate(models) {
      Payment.belongsTo(models.Invoice, { foreignKey: 'invoice_id', as: 'invoice' });
      Payment.belongsTo(models.Admin, { foreignKey: 'confirmed_by', as: 'confirmer' });
    }
  }

  Payment.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      invoice_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      amount_paid: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false
      },
      method: {
        type: DataTypes.ENUM('wave', 'momo', 'orange_money', 'zeepay', 'cash'),
        allowNull: false
      },
      payment_date: {
        type: DataTypes.DATE,
        allowNull: false
      },
      confirmed_by: {
        type: DataTypes.UUID,
        allowNull: true
      }
    },
    {
      sequelize,
      modelName: 'Payment',
      tableName: 'payments',
      underscored: true,
      timestamps: true
    }
  );

  return Payment;
};
