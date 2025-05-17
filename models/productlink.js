'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ProductLink extends Model {
    static associate(models) {
      ProductLink.belongsTo(models.Request, { foreignKey: 'request_id', as: 'request' });
    }
  }

  ProductLink.init(
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
      url: {
        type: DataTypes.TEXT,
        allowNull: false,
        validate: {
          isUrl: true
        }
      },
      note: {
        type: DataTypes.TEXT,
        allowNull: true
      }
    },
    {
      sequelize,
      modelName: 'ProductLink',
      tableName: 'product_links',
      underscored: true,
      timestamps: true
    }
  );

  return ProductLink;
};
