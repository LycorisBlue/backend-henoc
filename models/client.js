'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Client extends Model {
    static associate(models) {
      Client.hasMany(models.Request, { foreignKey: 'client_id', as: 'requests' });
    }
  }
  Client.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      whatsapp_number: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
          notEmpty: true,
          len: [10, 35], // Augmenté pour supporter 2 numéros
          isValidWhatsAppFormat(value) {
            // Validation personnalisée pour 1 ou 2 numéros
            const regex = /^\+\d{10,15}(\/\+\d{10,15})?$/;
            if (!regex.test(value)) {
              throw new Error('Format de numéro WhatsApp invalide. Utilisez +225xxxxxxxx ou +225xxxxxxxx/+225yyyyyyyy');
            }
          }
        }
      },
      full_name: {
        type: DataTypes.STRING,
        allowNull: true
      },
      email: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isEmail: true
        }
      },
      adresse: {
        type: DataTypes.TEXT,
        allowNull: true
      }
    },
    {
      sequelize,
      modelName: 'Client',
      tableName: 'clients',
      underscored: true,
      timestamps: true
    }
  );
  return Client;
};
