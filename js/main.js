// ---- Запуск ----
// Иконки в статичной шапке
$$('[data-act=prev]').forEach(b => b.innerHTML = I(IC.left, 20));
$$('[data-act=next]').forEach(b => b.innerHTML = I(IC.right, 20));
$('[data-act=settings]').innerHTML = I(IC.gear, 19);
$('.bar2 [data-act=search]').innerHTML = I(IC.search, 19);
$('.btn-new').innerHTML = I(IC.plus, 17) + 'Создать';

if (IS_BETA) { document.title = APP_TITLE; document.documentElement.classList.add('is-beta'); }

save();   // сохранить то, что добавила проверка данных разделов

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
render();
cloudStart();   // аккаунт: забрать свежие записи с сервера (js/cloud.js)
checkNotif();
checkShareHash();
