'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('requests', 'request_type', {
      type: Sequelize.ENUM('link', 'image'),
      allowNull: false,
      defaultValue: 'link',
      after: 'description'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('requests', 'request_type');
  }
};
