var bcanvas = document.getElementById("boogieBoard"),
            bctx = bcanvas.getContext("2d"),
            painting = false,
            lastX = 0,
            lastY = 0;

        // config
        bcanvas.width = window.innerWidth * 0.3;
        bcanvas.height = window.innerHeight * 0.4;

        bctx.strokeStyle = "#00ff4c";
        bctx.lineWidth = 5;
        bctx.lineCap = "round";
        bctx.lineJoin = "round";
        
        // fade effect
        function fadeOut() {
            bctx.fillStyle = "rgba(0, 0, 0, 0.05)";
            bctx.fillRect(0, 0, bcanvas.width, bcanvas.height);
            requestAnimationFrame(fadeOut);
        }
        fadeOut();

        // draw logic
        bcanvas.onmousedown = function (e) {
            painting = true;
            [lastX, lastY] = [e.offsetX, e.offsetY];
        };

        bcanvas.onmousemove = function (e) {
            if (!painting) return;
            bctx.beginPath();
            bctx.moveTo(lastX, lastY);
            bctx.lineTo(e.offsetX, e.offsetY);
            bctx.stroke();
            [lastX, lastY] = [e.offsetX, e.offsetY];
        };

        bcanvas.onmouseup = function () { painting = false; };
        bcanvas.onmouseleave = function () { painting = false; };
