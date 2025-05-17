'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class InvoiceItem extends Model {
    static associate(models) {
      InvoiceItem.belongsTo(models.Invoice, { foreignKey: 'invoice_id', as: 'invoice' });
    }
  }

  InvoiceItem.init(
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
      name: {
        type: DataTypes.STRING,
        allowNull: false
      },
      unit_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: 1
        }
      },
      subtotal: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false
      }
    },
    {
      sequelize,
      modelName: 'InvoiceItem',
      tableName: 'invoice_items',
      underscored: true,
      timestamps: true
    }
  );

  return InvoiceItem;
};
