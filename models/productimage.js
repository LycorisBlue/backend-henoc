'use strict';
const { Model } = require('sequelize');
const fs = require('fs');
const path = require('path');

module.exports = (sequelize, DataTypes) => {
  class ProductImage extends Model {
    static associate(models) {
      ProductImage.belongsTo(models.Request, {
        foreignKey: 'request_id',
        as: 'request'
      });
    }
  }

  ProductImage.init(
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
      file_path: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      file_name: {
        type: DataTypes.STRING,
        allowNull: false
      },
      file_size: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      mime_type: {
        type: DataTypes.STRING,
        allowNull: false
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true
      }
    },
    {
      sequelize,
      modelName: 'ProductImage',
      tableName: 'product_images',
      underscored: true,
      timestamps: true,
      hooks: {
        beforeDestroy: async (productImage) => {
          // Supprimer le fichier physique lors de la suppression de l'enregistrement
          const filePath = path.join(__dirname, '..', 'public', productImage.file_path);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }
      }
    }
  );

  return ProductImage;
};