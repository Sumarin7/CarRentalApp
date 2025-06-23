$(document).ready(function () {
   $('.top__slider').slick({
      arrows: true, //Вкл стрелок
      dots: true, // Вкл точек
      adaptiveHeight: true, // Адаптивные точки
      slidesToShow: 1, // Показ  кол-вл слайдов
      slidesToScroll: 1, // Скролл слайдов
      speed: 1000, // Скорость перелистываться анимации
      easing: 'easer', //Анимация перелистыванья
      infinite: true, // Бесконечность слайдера
      autoplay: true, // Авто-переключение
      fade: false,
      autoplaySpeed: 10000, // Перелистыванье авто
      initialSlide: 0, // слайд начало
      pauseOnFocus: false, // Пауза при клике на слайд
      pauseOnDotsHover: true, // Пауза при наведении на Dots
      pauseOnHover: true, // Пауза при наведении на слайд
      draggable: true, // Нельзя на ПК! свайпить
      swipe: true, // Нельзя на тачскринах свайпить
      touchThreshold: 7, // Момент перелистыванья
      touchMove: true, // Ручное перелистыванье выкл
      waitForAnimate: true, // Быстрая перекрутка
      centerMode: false, // Центральный слайд
      variableWidth: false, // Авто-Адаптивный слайдер 

      appendArrows: $('.button-nav'),// Расположение стрелок в отдельном меню 

      responsive: [ // брекПоинт и его настройка
         {
            breakpoint: 700,
            settings: {
               // centerMode: true, // Центральный слайд
               // variableWidth: true, // Авто-Адаптивный слайдер 

            },
            // }, {
            //    breakpoint: 900,
            //   settings: {
            //     slidesToShow: 2
            //   }
         }
      ],
      // mobileFirst: true,// miv-width !
   });

});

// $(window).scroll(function () {
//    if ($(window).scrollTop() < 20) {
//       $(".header__wrap").css("background", "transparent")
//    }
//    else {
//       $(".header__wrap").css("background", "#000")
//       $(".header__wrap").css("transition", "0.6s")
//    }
// });



$(document).ready(function () {
   var $button = $('.header__burger-btn');
   $button.click(function () {
      $('.header__burger-wrap').show();
   })
   $('.header__burger-btn-close').click(function () {
      $('.header__burger-wrap').hide();
   })
})

$(document).ready(function ($) {
   $('.button').click(function () {
      $('.header__application').fadeIn();
      return false;
   });

   $('.application__close').click(function () {
      $(this).parents('.header__application').fadeOut();
      return false;
   });

   $(document).keydown(function (e) {
      if (e.keyCode === 27) {
         e.stopPropagation();
         $('.header__application').fadeOut();
      }
   });

   $(".button").click(function (e) {
      e.preventDefault();
      $(".main").removeClass('active');
      $(this).addClass('active');
   })
});
