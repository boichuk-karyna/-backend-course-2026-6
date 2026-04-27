const express = require('express');
const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const http = require('http');


const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

program
  .requiredOption('-h, --host <host>', 'адреса сервера')
  .requiredOption('-p, --port <port>', 'порт сервера')
  .requiredOption('-c, --cache <cache>', 'шлях до директорії кеша');

program.parse(process.argv);
const options = program.opts();

const cacheDir = path.resolve(options.cache);
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

const dbPath = path.join(cacheDir, 'inventory.json');
let inventoryDB = [];
if (fs.existsSync(dbPath)) {
  inventoryDB = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
}
const saveDB = () => fs.writeFileSync(dbPath, JSON.stringify(inventoryDB, null, 2));

const app = express();
const upload = multer({ dest: cacheDir });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Inventory API',
      version: '1.0.0',
      description: 'API для управління інвентарем'
    },
    servers: [
      {
        url: `http://${options.host}:${options.port}`
      }
    ]
  },
  apis: ['./main.js'] 
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));



app.get('/RegisterForm.html', (req, res) =>
  res.sendFile(path.join(__dirname, 'RegisterForm.html'))
);

app.get('/SearchForm.html', (req, res) =>
  res.sendFile(path.join(__dirname, 'SearchForm.html'))
);

/**
 * @swagger
 * /register:
 *   post:
 *     summary: Створити інвентар
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - inventory_name
 *             properties:
 *               inventory_name:
 *                 type: string
 *               description:
 *                 type: string
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Created
 */
app.post('/register', upload.single('photo'), (req, res) => {
  const { inventory_name, description } = req.body;
  if (!inventory_name) {
    return res.status(400).send('Bad Request: inventory_name is required');
  }

  const newItem = {
    id: Date.now().toString(),
    inventory_name,
    description: description || '',
    photo: req.file ? req.file.filename : null
  };

  inventoryDB.push(newItem);
  saveDB();
  res.status(201).json(newItem);
});
app.all('/register', (req, res) => res.status(405).send('Method not allowed'));

/**
 * @swagger
 * /inventory:
 *   get:
 *     summary: Отримати всі записи
 *     responses:
 *       200:
 *         description: OK
 */
app.get('/inventory', (req, res) => {
  const list = inventoryDB.map(item => ({
    ...item,
    photoUrl: item.photo
      ? `http://${options.host}:${options.port}/inventory/${item.id}/photo`
      : null
  }));
  res.status(200).json(list);
});
app.all('/inventory', (req, res) => res.status(405).send('Method not allowed'));

/**
 * @swagger
 * /inventory/{id}:
 *   get:
 *     summary: Отримати по ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: OK
 *       404:
 *         description: Not found
 */
app.get('/inventory/:id', (req, res) => {
  const item = inventoryDB.find(i => i.id === req.params.id);
  if (!item) return res.status(404).send('Not found');

  res.status(200).json({
    ...item,
    photoUrl: item.photo
      ? `http://${options.host}:${options.port}/inventory/${item.id}/photo`
      : null
  });
});

/**
 * @swagger
 * /inventory/{id}:
 *   put:
 *     summary: Оновити інвентар
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: Updated
 */
app.put('/inventory/:id', (req, res) => {
  const itemIndex = inventoryDB.findIndex(i => i.id === req.params.id);
  if (itemIndex === -1) return res.status(404).send('Not found');

  const { inventory_name, description } = req.body;
  if (inventory_name) inventoryDB[itemIndex].inventory_name = inventory_name;
  if (description !== undefined) inventoryDB[itemIndex].description = description;

  saveDB();
  res.status(200).json(inventoryDB[itemIndex]);
});

/**
 * @swagger
 * /inventory/{id}:
 *   delete:
 *     summary: Видалити інвентар
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: Deleted
 */
app.delete('/inventory/:id', (req, res) => {
  const itemIndex = inventoryDB.findIndex(i => i.id === req.params.id);
  if (itemIndex === -1) return res.status(404).send('Not found');

  const item = inventoryDB[itemIndex];
  if (item.photo) {
    const photoPath = path.join(cacheDir, item.photo);
    if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);
  }

  inventoryDB.splice(itemIndex, 1);
  saveDB();
  res.status(200).send('Deleted successfully');
});
app.all('/inventory/:id', (req, res) => res.status(405).send('Method not allowed'));

/**
 * @swagger
 * /inventory/{id}/photo:
 *   get:
 *     summary: Отримати фото
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 */
app.get('/inventory/:id/photo', (req, res) => {
  const item = inventoryDB.find(i => i.id === req.params.id);
  if (!item || !item.photo) return res.status(404).send('Not found');

  const photoPath = path.join(cacheDir, item.photo);
  if (!fs.existsSync(photoPath)) return res.status(404).send('Not found');

  res.setHeader('Content-Type', 'image/jpeg');
  res.sendFile(photoPath);
});

/**
 * @swagger
 * /search:
 *   post:
 *     summary: Пошук
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               has_photo:
 *                 type: string
 */
app.post('/search', (req, res) => {
  const { id, has_photo } = req.body;
  const item = inventoryDB.find(i => i.id === id);
  if (!item) return res.status(404).send('Not found');

  let responseData = { ...item };
  if (has_photo === 'on' && item.photo) {
    responseData.description += ` (Photo URL: http://${options.host}:${options.port}/inventory/${item.id}/photo)`;
  }

  res.status(200).json(responseData);
});
app.all('/search', (req, res) => res.status(405).send('Method not allowed'));


const server = http.createServer(app);
server.listen(options.port, options.host, () => {
  console.log(`Server: http://${options.host}:${options.port}`);
  console.log(`Swagger: http://${options.host}:${options.port}/api-docs`);
});