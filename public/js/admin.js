let searchTimeout;

async function loadAllCars(searchQuery = '') {
    try {
        const response = await fetch(`/api/cars?search=${searchQuery}`);
        const cars = await response.json();
        const carContainer = document.getElementById('car-container');
        carContainer.innerHTML = '';

        cars.forEach(car => {
            const carCard = document.createElement('div');
            carCard.className = 'car-card';
            carCard.innerHTML = `
                <img class="car-image" src="${car.image}" alt="${car.brand} ${car.model}">
                <div class="car-details">
                    <p><strong>Марка:</strong> ${car.brand}</p>
                    <p><strong>Модель:</strong> ${car.model}</p>
                    <p><strong>Год:</strong> ${car.year}</p>
                    <p><strong>КПП:</strong> ${car.transmission}</p>
                    <p><strong>Кол-во мест:</strong> ${car.seats}</p>
                    <p><strong>Класс:</strong> ${car.class}</p>
                    <p><strong>Цена за 1 день:</strong> ${car.price?.['1_day'] || 'N/A'}</p>
                    <p><strong>Цена за 3 дня:</strong> ${car.price?.['3_days'] || 'N/A'}</p>
                </div>
                <div class="car-actions">
                    <button class="edit-button" onclick="editCar('${car._id}', '${car.class.toLowerCase()}')">Edit</button>
                    <button class="remove-button" onclick="removeCar('${car._id}', '${car.class.toLowerCase()}')">Remove</button>
                </div>
            `;
            carContainer.appendChild(carCard);
        });
    } catch (error) {
        console.error('Error loading cars:', error);
    }
}

async function loadReservations() {
    try {
        const response = await fetch('/api/admin/reservations');
        const reservations = await response.json();
        const reservationsContainer = document.getElementById('reservations-container');
        reservationsContainer.innerHTML = '';

        reservations.forEach(reservation => {
            const reservationItem = document.createElement('div');
            reservationItem.className = 'reservation-item';
            reservationItem.innerHTML = `
                <p>User: ${reservation.user.name} ${reservation.user.surname}</p>
                <p>Car: ${reservation.car.brand} ${reservation.car.model}</p>
                <p>Days: ${reservation.days}</p>
                <p>Total Price: ${reservation.totalPrice}</p>
                <p>Status: ${reservation.status}</p>
                ${reservation.status === 'pending' ? `
                    <button onclick="updateReservationStatus(${reservation._id}, 'active')">Accept</button>
                    <button onclick="updateReservationStatus(${reservation._id}, 'cancelled')">Reject</button>
                ` : ''}
            `;
            reservationsContainer.appendChild(reservationItem);
        });
    } catch (error) {
        console.error('Error loading reservations:', error);
    }
}

async function updateReservationStatus(reservationId, status) {
    try {
        const response = await fetch(`/api/reservations/${reservationId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status })
        });

        if (response.ok) {
            loadReservations();
        } else {
            console.error('Error updating reservation status');
        }
    } catch (error) {
        console.error('Error updating reservation status:', error);
    }
}

async function addCar(formData) {
    try {
        const response = await fetch('/api/cars', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            loadAllCars();
            hideModal();
        } else {
            const errorData = await response.json();
            console.error('Error adding car:', errorData.error);
            alert(`Error adding car: ${errorData.error}`);
        }
    } catch (error) {
        console.error('Error adding car:', error);
        alert('Error adding car. See console for details.');
    }
}

async function updateCar(carId, formData) {
    try {
        const response = await fetch(`/api/cars/${carId}`, {
            method: 'PUT',
            body: formData
        });

        if (response.ok) {
            loadAllCars();
            hideEditModal();
        } else {
            const errorData = await response.json();
            console.error('Error updating car:', errorData.error);
            alert(`Error updating car: ${errorData.error}`);
        }
    } catch (error) {
        console.error('Error updating car:', error);
        alert('Error updating car. See console for details.');
    }
}

async function removeCar(carId, carClass) {
    if (!confirm('Are you sure you want to delete this car?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/cars/${carId}?class=${carClass}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            loadAllCars();
        } else {
            const errorData = await response.json();
            console.error('Error deleting car:', errorData.error);
            alert(`Error deleting car: ${errorData.error}`);
        }
    } catch (error) {
        console.error('Error deleting car:', error);
        alert('Error deleting car. See console for details.');
    }
}

function showModal(car) {
    const modal = document.getElementById('car-form-modal');
    const form = document.getElementById('car-form');

    form.reset();
    document.getElementById('car-id').value = '';
    document.getElementById('car-class').value = 'economy';

    form.onsubmit = function(event) {
        event.preventDefault();
        const formData = new FormData(form);
        addCar(formData);
    };

    modal.style.display = 'block';
}

function showEditModal(car) {
    if (!car) {
        console.error('Car object is undefined');
        return;
    }

    const modal = document.getElementById('edit-car-form-modal');
    const form = document.getElementById('edit-car-form');

    form.reset();
    document.getElementById('edit-car-id').value = car._id || '';
    document.getElementById('edit-car-class').value = car.class.toLowerCase() || 'economy';
    document.getElementById('edit-brand').value = car.brand || '';
    document.getElementById('edit-model').value = car.model || '';
    document.getElementById('edit-year').value = car.year || '';
    document.getElementById('edit-transmission').value = car.transmission || '';
    document.getElementById('edit-seats').value = car.seats || '';
    document.getElementById('edit-price-1-day').value = car.price?.['1_day'] || '';
    document.getElementById('edit-price-3-days').value = car.price?.['3_days'] || '';

    form.onsubmit = function(event) {
        event.preventDefault();
        const carId = document.getElementById('edit-car-id').value;
        const formData = new FormData(form);
        updateCar(carId, formData);
    };

    modal.style.display = 'block';
}

function hideModal() {
    const modal = document.getElementById('car-form-modal');
    modal.style.display = 'none';
}

function hideEditModal() {
    const modal = document.getElementById('edit-car-form-modal');
    modal.style.display = 'none';
}

async function editCar(carId, carClass) {
    try {
        const response = await fetch(`/api/cars/${carClass}/${carId}`);
        if (response.ok) {
            const car = await response.json();
            showEditModal(car);
        } else {
            const errorData = await response.json();
            console.error('Error fetching car:', errorData.error);
            alert(`Error fetching car: ${errorData.error}`);
        }
    } catch (error) {
        console.error('Error fetching car:', error);
        alert('Error fetching car. See console for details.');
    }
}

function logout() {
    window.location.href = '/logout';
}

document.addEventListener('DOMContentLoaded', () => {
    loadAllCars();
    loadReservations();

    document.getElementById('search-input').addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            performSearch();
        }, 300);
    });

    document.getElementById('add-button').addEventListener('click', () => {
        showModal(null);
    });

    document.querySelectorAll('.close-button').forEach(button => {
        button.addEventListener('click', () => {
            hideModal();
            hideEditModal();
        });
    });

    window.onclick = function(event) {
        const modal = document.getElementById('car-form-modal');
        const editModal = document.getElementById('edit-car-form-modal');
        if (event.target == modal) {
            modal.style.display = 'none';
        }
        if (event.target == editModal) {
            editModal.style.display = 'none';
        }
    };
});

function performSearch() {
    const searchInput = document.getElementById('search-input').value;
    loadAllCars(searchInput);
}