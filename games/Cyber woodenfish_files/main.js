var muyvImg = document.getElementById("muyvImg");
var muyvNumSpan = document.getElementById("spanTag");
var muyvAudio = new Audio();
var muyvAudioSrcTemp = 0;
var gongDeSum = parseInt(muyvNumSpan.innerText);
var gongDeSumUp = 1;
var gongDeSumUpTemp = 0;
muyvAudio.src = muyvAudio02;
var myCookie = document.cookie.replace(
  /(?:(?:^|.*;\s*)muyvNumSpan\s*\=\s*([^;]*).*$)|^.*$/,
  "$1"
);
if (myCookie > 0) {
  gongDeSum = parseInt(myCookie);
  muyvNumSpan.innerText = gongDeSum;
} else {
  gongDeSum = 0;
  muyvNumSpan.innerText = gongDeSum;
}

function gongDeSumUpPlus() {
  gongDeSumUpTemp += parseInt(gongDeSumUp);
  if (gongDeSumUpTemp == 20) {
    gongDeSumUp = 20;
  } else if (gongDeSumUpTemp > 20) {
    gongDeSumUp = 1;
    gongDeSumUpTemp = 0;
  }
}

function muyvAudioFunction(pointerEvent) {
  var muyvAudioVar = new Audio(muyvAudio.src);
  muyvAudioVar.play();
  gongDeSum += gongDeSumUp;
  muyvNumSpan.innerText = gongDeSum;
  gongDeSumUpPlus();
  document.cookie =
    "muyvNumSpan=" + gongDeSum + "; max-age=315360000";
  const text = document.createElement("div");
  text.textContent = "功德+" + gongDeSumUp;
  text.classList.add("floating-text");
  var pointerX = pointerEvent && Number.isFinite(pointerEvent.clientX) ? pointerEvent.clientX : window.innerWidth / 2;
  var pointerY = pointerEvent && Number.isFinite(pointerEvent.clientY) ? pointerEvent.clientY : window.innerHeight / 2;
  text.style.left = (pointerX - 20) + "px";
  text.style.top = (pointerY - 30) + "px";
  document.body.appendChild(text);
  const animation = text.animate(
    [{
        opacity: 1,
        top: text.offsetTop + "px",
      },
      {
        opacity: 0,
        top: text.offsetTop - 160 + "px",
      },
    ], {
      duration: 800,
    }
  );
  animation.onfinish = () => {
    text.remove();
  };
}
var muyvAudioFunctionSetInterval;

function srartMuyvAudioFunctionSetInterval() {
  muyvAudioFunctionSetInterval = setInterval(muyvAudioFunction, 1000);
}

function changeAudio(changeAudioNum) {
  switch (changeAudioNum) {
    case 1:
      muyvAudio.src = muyvAudio01;
      alert("已切换至浓厚音效");
      break;
    case 2:
      muyvAudio.src = muyvAudio02;
      alert("已切换至清脆音效");
      break;
    case 3:
      muyvAudio.src = ikunAudio01;
      alert("已切换至珍癌粉音效");
      break;
    default:
      alert("音效切换错误，请刷新重试");
      break;
  }
  var muyvAudioVar = new Audio(muyvAudio.src);
  muyvAudioVar.play();
  gongDeSum -= 20;
  document.cookie = "muyvNumSpan=" + gongDeSum;
  muyvNumSpan.innerText = gongDeSum;
}

function GautamaLaugh() {
  var GautamaLaughAudioVar = new Audio(GautamaLaughAudio);
  GautamaLaughAudioVar.play();
  gongDeSum -= 60;
  document.cookie = "muyvNumSpan=" + gongDeSum;
  muyvNumSpan.innerText = gongDeSum;
}
var autoTimerClick;
var autoTimerClickTemp = false;

function autoClick() {
  if (autoTimerClickTemp == false) {
    autoTimerClick = setInterval(function () {
      muyvAudioFunction();
    }, 1500);
    autoTimerClickTemp = true;
    alert("已启用自动敲击");
  } else if (autoTimerClickTemp == true) {
    clearInterval(autoTimerClick);
    autoTimerClickTemp = false;
    alert("已禁用自动敲击");
  }
}
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape" && settingsBoxDisplayTemp === 1) {
    settingsBoxDisplay();
    return;
  }

  if (event.target.closest("button, a, audio")) {
    return;
  }

  if (
    event.code === "Enter" ||
    event.code === "Space" ||
    event.code === "NumpadEnter"
  ) {
    event.preventDefault();
    muyvAudioFunction(event);
  }
});
const lightOrDarkModelBtn = document.getElementById("lightOrDarkModelBtn");
const lightOrDarkIcon = document.getElementById("lightOrDarkIcon");

function lightOrDarkModel() {
  if (document.body.getAttribute("data-theme") == "light") {
    document.body.removeAttribute("data-theme", "light");
    document.body.setAttribute("data-theme", "dark");
    muyvImg.removeAttribute("style", "filter: invert(100%);");
    muyvImg.setAttribute("style", "filter: invert(0%);");
    lightOrDarkIcon.textContent = "☾";
    lightOrDarkModelBtn.setAttribute("aria-label", "切换到浅色模式");
  } else if (document.body.getAttribute("data-theme") == "dark") {
    document.body.removeAttribute("data-theme", "dark");
    document.body.setAttribute("data-theme", "light");
    muyvImg.removeAttribute("style", "filter: invert(0%);");
    muyvImg.setAttribute("style", "filter: invert(100%);");
    lightOrDarkIcon.textContent = "☀";
    lightOrDarkModelBtn.setAttribute("aria-label", "切换到深色模式");
  }
}
var settingsBoxDisplayTemp = 0;

function settingsBoxDisplay() {
  var settingsBox = document.getElementById("settingsBox");
  var divMask = document.getElementById("mask");
  var settingsButton = document.getElementById("settingsBtn");
  var closeButton = document.getElementById("settingsBoxExitIcon");
  if (settingsBoxDisplayTemp == 0) {
    settingsBox.style.cssText = "display: block;";
    divMask.style.cssText = "display: block;";
    settingsBox.setAttribute("aria-hidden", "false");
    settingsButton.setAttribute("aria-expanded", "true");
    settingsBoxDisplayTemp = 1;
    closeButton.focus();
  } else if (settingsBoxDisplayTemp == 1) {
    settingsBox.style.cssText = "display: none;";
    divMask.style.cssText = "display: none;";
    settingsBox.setAttribute("aria-hidden", "true");
    settingsButton.setAttribute("aria-expanded", "false");
    settingsBoxDisplayTemp = 0;
    settingsButton.focus();
  }
}
