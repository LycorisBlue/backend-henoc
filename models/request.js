'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Request extends Model {
    static associate(models) {
      Request.belongsTo(models.Client, { foreignKey: 'client_id', as: 'client' });
      Request.belongsTo(models.Admin, { foreignKey: 'assigned_admin_id', as: 'assigned_admin' });
      Request.hasMany(models.ProductLink, { foreignKey: 'request_id', as: 'product_links' });
      Request.hasMany(models.ProductImage, { foreignKey: 'request_id', as: 'product_images' });
      Request.hasOne(models.Invoice, { foreignKey: 'request_id', as: 'invoice' });
    }
  }
  Request.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      client_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      request_type: {
        type: DataTypes.ENUM('link', 'image'),
        allowNull: false,
        defaultValue: 'link'
      },
      status: {
        type: DataTypes.ENUM(
          'en_attente',
          'en_traitement',
          'facturé',
          'payé',
          'commandé',
          'expédié',
          'livré',
          'annulé'
        ),
        defaultValue: 'en_attente'
      },
      assigned_admin_id: {
        type: DataTypes.UUID,
        allowNull: true
      }
    },
    {
      sequelize,
      modelName: 'Request',
      tableName: 'requests',
      underscored: true,
      timestamps: true
    }
  );
  return Request;
};
