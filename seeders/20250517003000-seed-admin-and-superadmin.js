'use strict';
const bcrypt = require('bcrypt');

module.exports = {
  async up(queryInterface, Sequelize) {
    const hashedPassword = await bcrypt.hash('Admin@123', 10);
    const hashedSuperPassword = await bcrypt.hash('SuperAdmin@123', 10);

    await queryInterface.bulkInsert('admins', [
      {
        id: crypto.randomUUID(),
        name: 'Admin Principal',
        email: 'admin@example.com',
        password: hashedPassword,
        role: 'admin',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: crypto.randomUUID(),
        name: 'Super Admin',
        email: 'superadmin@example.com',
        password: hashedSuperPassword,
        role: 'superadmin',
        created_at: new Date(),
        updated_at: new Date()
      }
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('admins', {
      email: ['admin@example.com', 'superadmin@example.com']
    });
  }
};
