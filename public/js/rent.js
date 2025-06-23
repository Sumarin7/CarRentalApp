let currentCarClass = 'Economy';
let searchTimeout;
let selectedCar = null;
let selectedDays = 0;

async function loadCars(carClass = 'Economy', searchQuery = '') {
    try {
        const response = await fetch(`/api/cars/${carClass}?search=${searchQuery}`);
        const cars = await response.json();
        const carContainer = document.getElementById('car-container');
        carContainer.innerHTML = '';

        cars.forEach(car => {
            const carCard = document.createElement('div');
            carCard.className = 'rent__item';
            carCard.innerHTML = `
                <img class="rent__item-img" src="${car.image}" alt="${car.brand} ${car.model}">
                <div class="rent__item-name">${car.brand} ${car.model}</div>
                <div class="rent__item-info">
                    <p class="rent__item-text">Год выпуска <b>${car.year}</b></p>
                    <p class="rent__item-text">КПП <b>${car.transmission}</b></p>
                    <p class="rent__item-text">Мест <b>${car.seats}</b></p>
                </div>
                <div class="rent__item-block">
                    <div class="rent__item-price">
                        <span>1 сутки</span> <b>${car.price['1_day']}</b>
                    </div>
                    <div class="rent__item-price">
                        <span>3 суток</span> <b>${car.price['3_days']}</b>
                    </div>
                </div>
                <button class="rent__item-btn" onclick="handleReservationClick('${car.class}', '${car._id}')">RESERVATION</button>
            `;
            carContainer.appendChild(carCard);
        });
    } catch (error) {
        console.error('Error loading cars:', error);
    }
}

function changeCarClass(carClass) {
    currentCarClass = carClass;
    const buttons = document.querySelectorAll('.rent__class-btn');
    buttons.forEach(button => {
        button.classList.remove('active');
    });
    const activeButton = document.querySelector(`.rent__class-btn[onclick="changeCarClass('${carClass}')"]`);
    activeButton.classList.add('active');
    loadCars(carClass);
}

function performSearch() {
    const searchInput = document.getElementById('search-input').value;
    loadCars(currentCarClass, searchInput);
}

document.addEventListener('DOMContentLoaded', () => {
    loadCars();
    const buttons = document.querySelectorAll('.rent__class-btn');
    buttons.forEach(button => {
        button.addEventListener('click', () => {
            buttons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
        });
    });

    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            performSearch();
        }, 300);
    });
});

async function handleReservationClick(carClass, carId) {
    try {
        const authResponse = await fetch('/api/check-auth');
        const authStatus = await authResponse.json();

        if (authStatus.authenticated) {
            const carResponse = await fetch(`/api/cars/${carClass}/${carId}`);
            selectedCar = await carResponse.json();
            openModal(selectedCar);
        } else {
            window.location.href = '/login';
        }
    } catch (error) {
        console.error('Error checking user profile:', error);
    }
}

function openModal(car) {
    document.getElementById('reservation-modal').style.display = 'block';
    document.getElementById('car-info').innerHTML = `
        <h3>${car.brand} ${car.model}</h3>
        <p>Год выпуска: ${car.year}</p>
        <p>КПП: ${car.transmission}</p>
        <p>Мест: ${car.seats}</p>
        <img src="${car.image}" alt="${car.brand} ${car.model}" />
    `;
    document.getElementById('selected-days-info').innerHTML = '';
}

function closeModal() {
    document.getElementById('reservation-modal').style.display = 'none';
}

function selectDays(days) {
    selectedDays = days;
    const price = selectedCar.price[`${days}_day`] || selectedCar.price[`${days}_days`];
    document.getElementById('selected-days-info').innerHTML = `
        <p>Выбрано дней: ${days}</p>
        <p>Цена: ${price}</p>
        <button onclick="createReservation()">Забронировать</button>
    `;
}

async function createReservation() {
    if (selectedCar && selectedDays > 0) {
        try {
            const response = await fetch('/api/reservations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    carId: selectedCar._id,
                    carClass: selectedCar.class,
                    days: selectedDays
                })
            });
            
            if (response.ok) {
                const reservation = await response.json();
                
                // Получаем QR-код для отображения
                const qrResponse = await fetch(`/api/reservations/${reservation._id}/qrcode`);
                const qrData = await qrResponse.json();
                
                document.getElementById('selected-days-info').innerHTML = `
                    <div class="reservation-success">
                        <h3>Бронирование успешно!</h3>
                        <p>Автомобиль: ${reservation.car.brand} ${reservation.car.model}</p>
                        <p>Срок аренды: ${reservation.days} дней</p>
                        <p>Сумма к оплате: ${reservation.totalPrice}</p>
                        <p>Статус: ${reservation.status}</p>
                        <div class="qr-code-container">
                            <p>Отсканируйте QR-код для подтверждения оплаты:</p>
                            <img src="${qrData.qrCode}" alt="QR Code" class="qr-code" />
                        </div>
                        <button onclick="closeModal()">Закрыть</button>
                    </div>
                `;
            } else {
                const errorData = await response.json();
                alert(`Ошибка бронирования: ${errorData.error}`);
            }
        } catch (error) {
            console.error('Error creating reservation:', error);
            alert('Ошибка бронирования. Пожалуйста, попробуйте позже.');
        }
    } else {
        alert('Пожалуйста, выберите количество дней бронирования.');
    }
}