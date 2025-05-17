'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class InvoiceFee extends Model {
    static associate(models) {
      InvoiceFee.belongsTo(models.Invoice, { foreignKey: 'invoice_id', as: 'invoice' });
      InvoiceFee.belongsTo(models.FeeType, { foreignKey: 'fee_type_id', as: 'type' });
    }
  }

  InvoiceFee.init(
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
      fee_type_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
      }
    },
    {
      sequelize,
      modelName: 'InvoiceFee',
      tableName: 'invoice_fees',
      underscored: true,
      timestamps: true
    }
  );

  return InvoiceFee;
};
