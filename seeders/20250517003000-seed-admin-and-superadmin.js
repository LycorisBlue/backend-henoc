'use strict';
const bcrypt = require('bcrypt');

module.exports = {
  async up(queryInterface, Sequelize) {
    const hashedPassword = await bcrypt.hash('Admin@123', 10);
    const hashedSuperPassword = await bcrypt.hash('SuperAdmin@123', 10);

    await queryInterface.bulkInsert('admins', [
      {
        id: "61a639aa-8e7e-4e64-a0b7-59294a538d9a",
        name: 'Admin Principal',
        email: 'admin@example.com',
        password: hashedPassword,
        role: 'admin',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: "8ec85df4-b21f-41fa-8b6a-6e49b293f3bd",
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
