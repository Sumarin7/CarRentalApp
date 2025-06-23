const express = require('express');
const app = express();
const port = 3007;
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
const multer = require('multer');
const path = require('path');
const session = require('express-session');
const QRCode = require('qrcode');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

app.use(session({
    secret: 'secretKey',
    resave: false,
    saveUninitialized: true,
}));

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/images/BD/uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const qrStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/images/BD/qrcodes/');
    },
    filename: function (req, file, cb) {
        cb(null, `${uuidv4()}.png`);
    }
});

const upload = multer({ storage: storage });
const qrUpload = multer({ storage: qrStorage });

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'car_rental',
    port: 3307,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

pool.getConnection((err, connection) => {
    if (err) {
        console.error('MySQL connection error:', err);
        return;
    }
    console.log('Connected to MySQL');
    connection.release();
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

function checkAuth(req, res, next) {
    if (req.session.userId) {
        next();
    } else {
        res.redirect('/login');
    }
}

function checkAdmin(req, res, next) {
    if (req.session.userId === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Access denied' });
    }
}

app.get('/api/check-auth', (req, res) => {
    if (req.session.userId) {
        res.json({ authenticated: true, isAdmin: req.session.userId === 'admin' });
    } else {
        res.json({ authenticated: false });
    }
});

app.get('/rent', (req, res) => {
    res.sendFile(__dirname + '/public/rent.html');
});

app.get('/login', (req, res) => {
    res.sendFile(__dirname + '/public/login.html');
});

app.get('/admin', checkAuth, (req, res) => {
    res.sendFile(__dirname + '/public/admin.html');
});

app.get('/user', checkAuth, (req, res) => {
    res.sendFile(__dirname + '/public/user.html');
});

app.get('/api/profile', checkAuth, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.session.userId]);
        if (rows.length > 0) {
            const user = rows[0];
            res.json({
                name: user.name,
                surname: user.surname,
                email: user.email,
                number: user.number,
                avatar: user.avatar,
                login: user.login
            });
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ error: 'Error fetching user profile' });
    }
});

app.put('/api/profile', checkAuth, upload.single('avatar'), async (req, res) => {
    try {
        const updateData = {
            name: req.body.name,
            surname: req.body.surname,
            email: req.body.email,
            number: req.body.number
        };
        if (req.file) {
            updateData.avatar = `/images/BD/uploads/${req.file.filename}`;
        }
        const fields = Object.keys(updateData).map(key => `${key} = ?`).join(', ');
        const values = Object.values(updateData);
        values.push(req.session.userId);

        await pool.query(`UPDATE users SET ${fields} WHERE id = ?`, values);
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.session.userId]);
        res.json({ success: true, user: rows[0] });
    } catch (error) {
        console.error('Error updating user profile:', error);
        res.status(500).json({ error: 'Error updating user profile' });
    }
});

app.post('/api/profile/avatar', checkAuth, upload.single('avatar'), async (req, res) => {
    try {
        const avatarPath = `/images/BD/uploads/${req.file.filename}`;
        await pool.query('UPDATE users SET avatar = ? WHERE id = ?', [avatarPath, req.session.userId]);
        res.json({ success: true, avatar: avatarPath });
    } catch (error) {
        console.error('Error updating avatar:', error);
        res.status(500).json({ error: 'Error updating avatar' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ error: 'Failed to logout' });
        }
        res.redirect('/login');
    });
});

app.post('/login', async (req, res) => {
    const { login, password } = req.body;

    if (login === 'admin' && password === 'admin') {
        req.session.userId = 'admin';
        req.session.userLogin = 'admin';
        return res.redirect('/admin');
    } else {
        try {
            const [rows] = await pool.query('SELECT * FROM users WHERE login = ? AND password = ?', [login, password]);
            if (rows.length > 0) {
                req.session.userId = rows[0].id;
                req.session.userLogin = rows[0].login;
                return res.redirect('/user');
            } else {
                return res.send('Invalid login or password');
            }
        } catch (error) {
            console.error('Error during login:', error);
            return res.status(500).send('Error during login');
        }
    }
});

app.post('/register', async (req, res) => {
    const { name, surname, login, email, number, password } = req.body;

    try {
        await pool.query(
            'INSERT INTO users (name, surname, login, password, email, number) VALUES (?, ?, ?, ?, ?, ?)',
            [name, surname, login, password, email, number]
        );
        res.redirect('/login');
    } catch (error) {
        console.error('Error during registration:', error);
        res.status(500).send('Error during registration');
    }
});

app.get('/api/cars/:class', async (req, res) => {
    const carClass = req.params.class.toLowerCase();
    const searchQuery = req.query.search || '';

    let tableName;
    switch (carClass) {
        case 'economy':
            tableName = 'cars_economy';
            break;
        case 'comfort':
            tableName = 'cars_comfort';
            break;
        case 'business':
            tableName = 'cars_business';
            break;
        default:
            return res.status(400).json({ error: 'Invalid car class' });
    }

    try {
        let query = `SELECT * FROM ${tableName}`;
        const params = [];
        
        if (searchQuery) {
            query += ` WHERE brand LIKE ? OR model LIKE ? OR class LIKE ?`;
            const searchParam = `%${searchQuery}%`;
            params.push(searchParam, searchParam, searchParam);

            const searchNumber = parseInt(searchQuery);
            if (!isNaN(searchNumber)) {
                query += ` OR year = ? OR seats = ?`;
                params.push(searchNumber, searchNumber);
            }
        }

        const [rows] = await pool.query(query, params);
        res.json(rows.map(row => ({
            _id: row.id,
            brand: row.brand,
            model: row.model,
            year: row.year,
            transmission: row.transmission,
            seats: row.seats,
            class: row.class,
            price: {
                '1_day': row.price_1_day,
                '3_days': row.price_3_days
            },
            image: row.image
        })));
    } catch (error) {
        console.error('Error fetching cars:', error);
        res.status(500).json({ error: 'Error fetching cars' });
    }
});

app.get('/api/cars', async (req, res) => {
    const searchQuery = req.query.search || '';

    try {
        let query = `
            SELECT * FROM cars_economy
            UNION
            SELECT * FROM cars_comfort
            UNION
            SELECT * FROM cars_business
        `;
        const params = [];

        if (searchQuery) {
            query = `
                SELECT * FROM cars_economy
                WHERE brand LIKE ? OR model LIKE ? OR class LIKE ?
                UNION
                SELECT * FROM cars_comfort
                WHERE brand LIKE ? OR model LIKE ? OR class LIKE ?
                UNION
                SELECT * FROM cars_business
                WHERE brand LIKE ? OR model LIKE ? OR class LIKE ?
            `;
            const searchParam = `%${searchQuery}%`;
            params.push(searchParam, searchParam, searchParam);
            params.push(searchParam, searchParam, searchParam);
            params.push(searchParam, searchParam, searchParam);

            const searchNumber = parseInt(searchQuery);
            if (!isNaN(searchNumber)) {
                query = `
                    SELECT * FROM cars_economy
                    WHERE brand LIKE ? OR model LIKE ? OR year = ? OR seats = ? OR class LIKE ?
                    UNION
                    SELECT * FROM cars_comfort
                    WHERE brand LIKE ? OR model LIKE ? OR year = ? OR seats = ? OR class LIKE ?
                    UNION
                    SELECT * FROM cars_business
                    WHERE brand LIKE ? OR model LIKE ? OR year = ? OR seats = ? OR class LIKE ?
                `;
                params.length = 0;
                params.push(searchParam, searchParam, searchNumber, searchNumber, searchParam);
                params.push(searchParam, searchParam, searchNumber, searchNumber, searchParam);
                params.push(searchParam, searchParam, searchNumber, searchNumber, searchParam);
            }
        }

        const [rows] = await pool.query(query, params);
        res.json(rows.map(row => ({
            _id: row.id,
            brand: row.brand,
            model: row.model,
            year: row.year,
            transmission: row.transmission,
            seats: row.seats,
            class: row.class,
            price: {
                '1_day': row.price_1_day,
                '3_days': row.price_3_days
            },
            image: row.image
        })));
    } catch (error) {
        console.error('Error fetching cars:', error);
        res.status(500).json({ error: 'Error fetching cars' });
    }
});

app.post('/api/cars', upload.single('image'), async (req, res) => {
    const { brand, model, year, transmission, seats, class: carClass, price_1_day, price_3_days } = req.body;
    const imagePath = req.file ? `/images/BD/uploads/${req.file.filename}` : '';

    let tableName;
    switch (carClass.toLowerCase()) {
        case 'economy':
            tableName = 'cars_economy';
            break;
        case 'comfort':
            tableName = 'cars_comfort';
            break;
        case 'business':
            tableName = 'cars_business';
            break;
        default:
            return res.status(400).json({ error: 'Invalid car class' });
    }

    try {
        const yearNum = parseInt(year);
        const seatsNum = parseInt(seats);
        if (isNaN(yearNum) || isNaN(seatsNum)) {
            return res.status(400).json({ error: 'Year and seats must be valid numbers' });
        }

        const [result] = await pool.query(
            `INSERT INTO ${tableName} (brand, model, year, transmission, seats, class, price_1_day, price_3_days, image)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [brand, model, yearNum, transmission, seatsNum, carClass, price_1_day || 'N/A', price_3_days || 'N/A', imagePath]
        );
        const [newCar] = await pool.query(`SELECT * FROM ${tableName} WHERE id = ?`, [result.insertId]);
        res.status(201).json({
            _id: newCar[0].id,
            brand: newCar[0].brand,
            model: newCar[0].model,
            year: newCar[0].year,
            transmission: newCar[0].transmission,
            seats: newCar[0].seats,
            class: newCar[0].class,
            price: {
                '1_day': newCar[0].price_1_day,
                '3_days': newCar[0].price_3_days
            },
            image: newCar[0].image
        });
    } catch (error) {
        console.error('Error adding car:', error);
        res.status(500).json({ error: 'Error adding car' });
    }
});

app.put('/api/cars/:id', upload.single('image'), async (req, res) => {
    const carId = parseInt(req.params.id);
    const { brand, model, year, transmission, seats, class: carClass, price_1_day, price_3_days } = req.body;
    let imagePath = req.file ? `/images/BD/uploads/${req.file.filename}` : null;

    let tableName;
    switch (carClass.toLowerCase()) {
        case 'economy':
            tableName = 'cars_economy';
            break;
        case 'comfort':
            tableName = 'cars_comfort';
            break;
        case 'business':
            tableName = 'cars_business';
            break;
        default:
            return res.status(400).json({ error: 'Invalid car class' });
    }

    try {
        const yearNum = parseInt(year);
        const seatsNum = parseInt(seats);
        if (isNaN(yearNum) || isNaN(seatsNum) || isNaN(carId)) {
            return res.status(400).json({ error: 'Year, seats, and car ID must be valid numbers' });
        }

        const fields = [
            'brand = ?',
            'model = ?',
            'year = ?',
            'transmission = ?',
            'seats = ?',
            'class = ?',
            'price_1_day = ?',
            'price_3_days = ?'
        ];
        const values = [brand, model, yearNum, transmission, seatsNum, carClass, price_1_day || 'N/A', price_3_days || 'N/A'];
        if (imagePath) {
            fields.push('image = ?');
            values.push(imagePath);
        }
        values.push(carId);

        await pool.query(`UPDATE ${tableName} SET ${fields.join(', ')} WHERE id = ?`, values);
        const [updatedCar] = await pool.query(`SELECT * FROM ${tableName} WHERE id = ?`, [carId]);
        if (updatedCar.length === 0) {
            return res.status(404).json({ error: 'Car not found' });
        }
        res.json({
            _id: updatedCar[0].id,
            brand: updatedCar[0].brand,
            model: updatedCar[0].model,
            year: updatedCar[0].year,
            transmission: updatedCar[0].transmission,
            seats: updatedCar[0].seats,
            class: updatedCar[0].class,
            price: {
                '1_day': updatedCar[0].price_1_day,
                '3_days': updatedCar[0].price_3_days
            },
            image: updatedCar[0].image
        });
    } catch (error) {
        console.error('Error updating car:', error);
        res.status(500).json({ error: 'Error updating car' });
    }
});

app.delete('/api/cars/:id', async (req, res) => {
    const carId = parseInt(req.params.id);
    const carClass = req.query.class.toLowerCase();

    let tableName;
    switch (carClass) {
        case 'economy':
            tableName = 'cars_economy';
            break;
        case 'comfort':
            tableName = 'cars_comfort';
            break;
        case 'business':
            tableName = 'cars_business';
            break;
        default:
            return res.status(400).json({ error: 'Invalid car class' });
    }

    try {
        if (isNaN(carId)) {
            return res.status(400).json({ error: 'Car ID must be a valid number' });
        }
        const [result] = await pool.query(`DELETE FROM ${tableName} WHERE id = ?`, [carId]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Car not found' });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting car:', error);
        res.status(500).json({ error: 'Error deleting car' });
    }
});

app.get('/api/cars/:class/:id', async (req, res) => {
    const carClass = req.params.class.toLowerCase();
    const carId = parseInt(req.params.id);

    let tableName;
    switch (carClass) {
        case 'economy':
            tableName = 'cars_economy';
            break;
        case 'comfort':
            tableName = 'cars_comfort';
            break;
        case 'business':
            tableName = 'cars_business';
            break;
        default:
            return res.status(400).json({ error: 'Invalid car class' });
    }

    try {
        if (isNaN(carId)) {
            return res.status(400).json({ error: 'Car ID must be a valid number' });
        }
        const [rows] = await pool.query(`SELECT * FROM ${tableName} WHERE id = ?`, [carId]);
        if (rows.length > 0) {
            const car = rows[0];
            res.json({
                _id: car.id,
                brand: car.brand,
                model: car.model,
                year: car.year,
                transmission: car.transmission,
                seats: car.seats,
                class: car.class,
                price: {
                    '1_day': car.price_1_day,
                    '3_days': car.price_3_days
                },
                image: car.image
            });
        } else {
            res.status(404).json({ error: 'Car not found' });
        }
    } catch (error) {
        console.error('Error fetching car:', error);
        res.status(500).json({ error: 'Error fetching car' });
    }
});

app.post('/api/reservations', checkAuth, async (req, res) => {
    const { carId, carClass, days } = req.body;

    let tableName;
    switch (carClass.toLowerCase()) {
        case 'economy':
            tableName = 'cars_economy';
            break;
        case 'comfort':
            tableName = 'cars_comfort';
            break;
        case 'business':
            tableName = 'cars_business';
            break;
        default:
            return res.status(400).json({ error: 'Invalid car class' });
    }

    try {
        const carIdNum = parseInt(carId);
        const daysNum = parseInt(days);
        if (isNaN(carIdNum) || isNaN(daysNum) || daysNum < 1) {
            return res.status(400).json({ error: 'Car ID and days must be valid positive numbers' });
        }

        const [carRows] = await pool.query(`SELECT * FROM ${tableName} WHERE id = ?`, [carIdNum]);
        if (carRows.length === 0) {
            return res.status(404).json({ error: 'Car not found' });
        }
        const car = carRows[0];
        const price = daysNum === 1 ? car.price_1_day : car.price_3_days;

        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + daysNum * 24 * 60 * 60 * 1000);

        // Сначала создаем бронирование, чтобы получить ID
        const [result] = await pool.query(
            'INSERT INTO reservations (user_id, car_id, car_class, days, total_price, date, start_time, end_time, status) VALUES (?, ?, ?, ?, ?, NOW(), ?, ?, ?)',
            [req.session.userId, carIdNum, carClass, daysNum, price, startTime, endTime, 'pending']
        );

        // Генерируем QR-код с актуальным ID бронирования
        const qrData = {
            reservationId: result.insertId,
            userId: req.session.userId,
            carId: carIdNum,
            carClass: carClass,
            startTime: startTime,
            totalPrice: price
        };

        const qrCodesDir = path.join(__dirname, 'public', 'images', 'BD', 'qrcodes');

        // Ensure the directory exists
        await fs.mkdir(qrCodesDir, { recursive: true });
        console.log('QR codes directory ready');

        // Generate QR code
        const qrFileName = `${uuidv4()}.png`;
        const qrPath = path.join(qrCodesDir, qrFileName);
        await QRCode.toFile(qrPath, JSON.stringify(qrData));
        const qrCodePath = `/images/BD/qrcodes/${qrFileName}`;

        // Обновляем бронирование с путем к QR-коду
        await pool.query('UPDATE reservations SET qr_code = ? WHERE id = ?', [qrCodePath, result.insertId]);

        // Получаем полные данные бронирования для ответа
        const [reservationRows] = await pool.query(`
            SELECT r.*, c.brand, c.model, c.year, c.transmission, c.seats, c.class, c.price_1_day, c.price_3_days, c.image
            FROM reservations r
            JOIN ${tableName} c ON r.car_id = c.id
            WHERE r.id = ?
        `, [result.insertId]);

        if (reservationRows.length === 0) {
            return res.status(500).json({ error: 'Failed to retrieve created reservation' });
        }

        const reservation = reservationRows[0];
        const responseData = {
            _id: reservation.id,
            userId: reservation.user_id,
            car: {
                _id: reservation.car_id,
                brand: reservation.brand,
                model: reservation.model,
                year: reservation.year,
                transmission: reservation.transmission,
                seats: reservation.seats,
                class: reservation.class,
                price: {
                    '1_day': reservation.price_1_day,
                    '3_days': reservation.price_3_days
                },
                image: reservation.image
            },
            days: reservation.days,
            totalPrice: reservation.total_price,
            date: reservation.date,
            startTime: reservation.start_time,
            endTime: reservation.end_time,
            qrCodePath: reservation.qr_code,
            status: reservation.status
        };

        res.status(201).json(responseData);
    } catch (error) {
        console.error('Error creating reservation:', error);
        res.status(500).json({ error: 'Error creating reservation' });
    }
});

app.get('/api/reservations/:id/qrcode', checkAuth, async (req, res) => {
    const reservationId = parseInt(req.params.id);

    try {
        const [rows] = await pool.query('SELECT * FROM reservations WHERE id = ? AND user_id = ?', [reservationId, req.session.userId]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Reservation not found' });
        }

        const reservation = rows[0];
        const qrData = {
            reservationId: reservation.id,
            userId: reservation.user_id,
            carId: reservation.car_id,
            carClass: reservation.car_class,
            startTime: reservation.start_time,
            totalPrice: reservation.total_price
        };

        // Генерируем QR-код как Data URL для немедленного отображения
        const qrCodeUrl = await QRCode.toDataURL(JSON.stringify(qrData));
        
        res.json({ 
            qrCode: qrCodeUrl,
            reservation: {
                id: reservation.id,
                carId: reservation.car_id,
                totalPrice: reservation.total_price,
                status: reservation.status
            }
        });
    } catch (error) {
        console.error('Error generating QR code:', error);
        res.status(500).json({ error: 'Error generating QR code' });
    }
});

app.post('/api/reservations/:id/scan', checkAuth, async (req, res) => {
    const reservationId = parseInt(req.params.id);

    try {
        if (isNaN(reservationId)) {
            return res.status(400).json({ error: 'Reservation ID must be a valid number' });
        }

        const [rows] = await pool.query('SELECT * FROM reservations WHERE id = ? AND user_id = ?', [reservationId, req.session.userId]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Reservation not found' });
        }

        await pool.query('UPDATE reservations SET status = ? WHERE id = ?', ['active', reservationId]);

        res.json({ success: true, qrCodePath: rows[0].qr_code });
    } catch (error) {
        console.error('Error activating reservation:', error);
        res.status(500).json({ error: 'Error activating reservation' });
    }
});

app.post('/api/reservations/validate-qr', checkAuth, async (req, res) => {
    const { qrData } = req.body;

    try {
        const qrContent = JSON.parse(qrData);
        const reservationId = parseInt(qrContent.reservationId);

        if (isNaN(reservationId)) {
            return res.status(400).json({ error: 'Invalid reservation ID' });
        }

        const [rows] = await pool.query('SELECT * FROM reservations WHERE id = ? AND user_id = ?', [reservationId, qrContent.userId]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Reservation not found' });
        }

        if (rows[0].status !== 'pending') {
            return res.status(400).json({ error: 'Reservation is not pending' });
        }

        await pool.query('UPDATE reservations SET status = ? WHERE id = ?', ['active', reservationId]);

        res.json({ success: true, reservationId: reservationId });
    } catch (error) {
        console.error('Error validating QR code:', error);
        res.status(500).json({ error: 'Error validating QR code' });
    }
});

app.get('/api/reservations', checkAuth, async (req, res) => {
    const carClass = (req.query.class || 'economy').toLowerCase();

    let tableName;
    switch (carClass) {
        case 'economy':
            tableName = 'cars_economy';
            break;
        case 'comfort':
            tableName = 'cars_comfort';
            break;
        case 'business':
            tableName = 'cars_business';
            break;
        default:
            return res.status(400).json({ error: 'Invalid car class' });
    }

    try {
        const [rows] = await pool.query(`
            SELECT r.*, c.brand, c.model, c.year, c.transmission, c.seats, c.class, c.price_1_day, c.price_3_days, c.image
            FROM reservations r
            JOIN ${tableName} c ON r.car_id = c.id AND r.car_class = c.class
            WHERE r.user_id = ?
        `, [req.session.userId]);
        res.json(rows.map(row => ({
            _id: row.id,
            userId: row.user_id,
            car: {
                _id: row.car_id,
                brand: row.brand,
                model: row.model,
                year: row.year,
                transmission: row.transmission,
                seats: row.seats,
                class: row.class,
                price: {
                    '1_day': row.price_1_day,
                    '3_days': row.price_3_days
                },
                image: row.image
            },
            days: row.days,
            totalPrice: row.total_price,
            date: row.date,
            startTime: row.start_time,
            endTime: row.end_time,
            qrCodePath: row.qr_code,
            status: row.status
        })));
    } catch (error) {
        console.error('Error fetching reservations:', error);
        res.status(500).json({ error: 'Error fetching reservations' });
    }
});

app.get('/api/admin/reservations', checkAuth, async (req, res) => {
    if (req.session.userId !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        const [rows] = await pool.query(`
            SELECT r.*, u.name, u.surname, c.brand, c.model
            FROM reservations r
            JOIN users u ON r.user_id = u.id
            LEFT JOIN cars_economy c ON r.car_id = c.id AND r.car_class = 'Economy'
            LEFT JOIN cars_comfort cc ON r.car_id = cc.id AND r.car_class = 'Comfort'
            LEFT JOIN cars_business cb ON r.car_id = cb.id AND r.car_class = 'Business'
        `);
        res.json(rows.map(row => ({
            _id: row.id,
            user: {
                id: row.user_id,
                name: row.name,
                surname: row.surname
            },
            car: {
                brand: row.brand || row.cc_brand || row.cb_brand,
                model: row.model || row.cc_model || row.cb_model
            },
            days: row.days,
            totalPrice: row.total_price,
            date: row.date,
            status: row.status
        })));
    } catch (error) {
        console.error('Error fetching admin reservations:', error);
        res.status(500).json({ error: 'Error fetching reservations' });
    }
});

app.put('/api/reservations/:id/status', checkAuth, async (req, res) => {
    if (req.session.userId !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
    }

    const reservationId = parseInt(req.params.id);
    const { status } = req.body;

    if (!['pending', 'active', 'completed', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    try {
        const [result] = await pool.query('UPDATE reservations SET status = ? WHERE id = ?', [status, reservationId]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Reservation not found' });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating reservation status:', error);
        res.status(500).json({ error: 'Error updating reservation status' });
    }
});

app.get('/api/locations', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM locations');
        res.json(rows);
    } catch (error) {
        console.error('Error fetching locations:', error);
        res.status(500).json({ error: 'Error fetching locations' });
    }
});

app.post('/api/locations', checkAuth, checkAdmin, async (req, res) => {
    const { name, address, latitude, longitude, type } = req.body;

    try {
        if (!name || !address || isNaN(latitude) || isNaN(longitude) || !type) {
            return res.status(400).json({ error: 'All fields are required and must be valid' });
        }

        const [result] = await pool.query(
            'INSERT INTO locations (name, address, latitude, longitude, type) VALUES (?, ?, ?, ?, ?)',
            [name, address, parseFloat(latitude), parseFloat(longitude), type]
        );

        const [newLocation] = await pool.query('SELECT * FROM locations WHERE id = ?', [result.insertId]);
        res.status(201).json(newLocation[0]);
    } catch (error) {
        console.error('Error adding location:', error);
        res.status(500).json({ error: 'Error adding location' });
    }
});

app.put('/api/locations/:id', checkAuth, checkAdmin, async (req, res) => {
    const locationId = parseInt(req.params.id);
    const { name, address, latitude, longitude, type } = req.body;

    try {
        if (isNaN(locationId) || !name || !address || isNaN(latitude) || isNaN(longitude) || !type) {
            return res.status(400).json({ error: 'All fields are required and must be valid' });
        }

        const [result] = await pool.query(
            'UPDATE locations SET name = ?, address = ?, latitude = ?, longitude = ?, type = ? WHERE id = ?',
            [name, address, parseFloat(latitude), parseFloat(longitude), type, locationId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Location not found' });
        }

        const [updatedLocation] = await pool.query('SELECT * FROM locations WHERE id = ?', [locationId]);
        res.json(updatedLocation[0]);
    } catch (error) {
        console.error('Error updating location:', error);
        res.status(500).json({ error: 'Error updating location' });
    }
});

app.delete('/api/locations/:id', checkAuth, checkAdmin, async (req, res) => {
    const locationId = parseInt(req.params.id);

    try {
        if (isNaN(locationId)) {
            return res.status(400).json({ error: 'Location ID must be a valid number' });
        }

        const [result] = await pool.query('DELETE FROM locations WHERE id = ?', [locationId]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Location not found' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting location:', error);
        res.status(500).json({ error: 'Error deleting location' });
    }
});

app.delete('/api/reservations/:id', checkAuth, async (req, res) => {
    const reservationId = parseInt(req.params.id);

    try {
        if (isNaN(reservationId)) {
            return res.status(400).json({ error: 'Reservation ID must be a valid number' });
        }
        const [result] = await pool.query('DELETE FROM reservations WHERE id = ?', [reservationId]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Reservation not found' });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting reservation:', error);
        res.status(500).json({ error: 'Error deleting reservation' });
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://127.0.0.1:${port}`);
});