module.exports = {
    apps: [
        {
            name: 'china-api', // Nom de votre application
            script: './bin/www', // Point d'entrée (identique à vos scripts npm)
            env: {
                NODE_ENV: 'development', // Variables d'environnement pour le mode développement
            },
            env_production: {
                NODE_ENV: 'production', // Variables d'environnement pour le mode production
            },
            env_test: {
                NODE_ENV: 'test', // Variables d'environnement pour le mode test
            },
            instances: 1, // Nombre d'instances (1 = mode fork, >1 = mode cluster)
            exec_mode: 'fork', // Mode fork ou cluster
            watch: false, // Désactivez le watch pour un serveur de production 
            node_args: '--max-old-space-size=4096', // Alloue 4 Go de RAM
        },
    ],
};

