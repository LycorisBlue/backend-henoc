'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FeeType extends Model {
    static associate(models) {
      FeeType.belongsTo(models.Admin, { foreignKey: 'created_by', as: 'creator' });
      FeeType.hasMany(models.InvoiceFee, { foreignKey: 'fee_type_id', as: 'fees' });
    }
  }

  FeeType.init(
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
      description: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: false
      }
    },
    {
      sequelize,
      modelName: 'FeeType',
      tableName: 'fee_types',
      underscored: true,
      timestamps: true
    }
  );

  return FeeType;
};
