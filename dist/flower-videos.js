(() => {
  'use strict';

  // Remove the white video backdrop while preserving soft flower edges.
  function createKeyer(layer) {
    const canvas = document.createElement('canvas');
    canvas.className = 'flower-video-canvas';
    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      powerPreference: 'low-power',
    });
    if (!gl) return null;

    function shader(type, source) {
      const result = gl.createShader(type);
      gl.shaderSource(result, source);
      gl.compileShader(result);
      if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
        throw new Error('Flower video shader could not compile');
      }
      return result;
    }

    try {
      const program = gl.createProgram();
      gl.attachShader(
        program,
        shader(
          gl.VERTEX_SHADER,
          `
        attribute vec2 position;
        attribute vec2 uv;
        varying vec2 textureUV;
        // Exclude the thin codec border at the edge of each frame.
        void main() { textureUV = mix(vec2(0.002), vec2(0.998), uv); gl_Position = vec4(position, 0.0, 1.0); }
      `,
        ),
      );
      gl.attachShader(
        program,
        shader(
          gl.FRAGMENT_SHADER,
          `
        precision mediump float;
        uniform sampler2D currentFrame;
        uniform sampler2D nextFrame;
        uniform float dissolve;
        varying vec2 textureUV;
        vec4 cutout(vec4 color) {
          float distanceToWhite = 1.0 - min(color.r, min(color.g, color.b));
          float alpha = smoothstep(0.035, 0.16, distanceToWhite);
          // Remove white contamination at the soft edge, in premultiplied alpha.
          vec3 foreground = clamp(color.rgb - vec3(1.0 - alpha), vec3(0.0), vec3(alpha));
          return vec4(foreground, alpha);
        }
        void main() {
          gl_FragColor = mix(cutout(texture2D(currentFrame, textureUV)),
                             cutout(texture2D(nextFrame, textureUV)), dissolve);
        }
      `,
        ),
      );
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error('Flower video shader could not link');
      gl.useProgram(program);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([
          -1, -1, 0, 1, 1, -1, 1, 1, -1, 1, 0, 0, -1, 1, 0, 0, 1, -1, 1, 1, 1, 1, 1, 0,
        ]),
        gl.STATIC_DRAW,
      );
      for (const [name, offset] of [
        ['position', 0],
        ['uv', 8],
      ]) {
        const location = gl.getAttribLocation(program, name);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 16, offset);
      }
      const textures = [0, 1].map((unit) => {
        const texture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return texture;
      });
      gl.uniform1i(gl.getUniformLocation(program, 'currentFrame'), 0);
      gl.uniform1i(gl.getUniformLocation(program, 'nextFrame'), 1);
      const dissolve = gl.getUniformLocation(program, 'dissolve');
      layer.append(canvas);

      const resize = () => {
        const width = Math.max(
          1,
          Math.min(1280, Math.round(layer.clientWidth * Math.min(devicePixelRatio || 1, 2))),
        );
        canvas.width = width;
        canvas.height = Math.round((width * 9) / 16);
        gl.viewport(0, 0, canvas.width, canvas.height);
      };
      new ResizeObserver(resize).observe(layer);
      resize();

      return {
        canvas,
        draw(current, next, blend) {
          if (gl.isContextLost()) throw new Error('Flower video context unavailable');
          [current, blend > 0 ? next : current].forEach((video, unit) => {
            gl.activeTexture(gl.TEXTURE0 + unit);
            gl.bindTexture(gl.TEXTURE_2D, textures[unit]);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
          });
          gl.uniform1f(dissolve, blend);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
        },
      };
    } catch {
      canvas.remove();
      return null;
    }
  }

  class FlowerVideo {
    constructor(element) {
      this.element = element;
      this.active = 0;
      this.fading = false;
      this.paused = true;
      this.started = false;
      this.frame = 0;
      this.lastDraw = 0;
      this.layer = document.createElement('div');
      this.layer.className = 'flower-video-layer';
      this.layer.setAttribute('aria-hidden', 'true');
      element.append(this.layer);
      this.videos = [0, 1].map(() => {
        const video = document.createElement('video');
        video.src = element.dataset.flowerVideo;
        video.muted = true;
        video.defaultMuted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.setAttribute('muted', '');
        video.setAttribute('playsinline', '');
        video.disablePictureInPicture = true;
        video.tabIndex = -1;
        video.addEventListener('canplay', () => this.resume());
        this.layer.append(video);
        return video;
      });
      this.keyer = createKeyer(this.layer);
      this.element.classList.toggle('has-keyed-video', Boolean(this.keyer));
      this.tick = this.tick.bind(this);
    }

    play(video) {
      if (video.dataset.playPending === 'true') return;
      video.dataset.playPending = 'true';
      video
        .play()
        .then(() => {
          if (this.paused) {
            video.pause();
            return;
          }
          this.started = true;
          if (!this.frame) this.frame = requestAnimationFrame(this.tick);
        })
        .catch(() => {
          // Keep the original transparent still if autoplay is blocked.
        })
        .finally(() => {
          delete video.dataset.playPending;
        });
    }

    resume() {
      if (this.paused) return;
      this.play(this.videos[this.active]);
      if (this.fading) this.play(this.videos[1 - this.active]);
    }

    setPaused(paused, reducedMotion) {
      this.paused = paused || reducedMotion;
      this.element.classList.toggle('prefers-still-flowers', reducedMotion);
      if (this.paused) {
        this.videos.forEach((video) => video.pause());
        cancelAnimationFrame(this.frame);
        this.frame = 0;
      } else this.resume();
    }

    tick(now) {
      this.frame = 0;
      if (this.paused) return;
      this.frame = requestAnimationFrame(this.tick);
      // The source is 24 fps. Limit compositing work on high-refresh displays.
      if (now - this.lastDraw < 1000 / 30) return;
      this.lastDraw = now;
      let current = this.videos[this.active];
      let next = this.videos[1 - this.active];
      if (!this.started || current.readyState < 2) return;

      const fadeSeconds = Math.min(0.7, current.duration / 4);
      if (
        !this.fading &&
        Number.isFinite(fadeSeconds) &&
        current.currentTime >= current.duration - fadeSeconds &&
        next.readyState >= 2
      ) {
        next.currentTime = 0;
        this.fading = true;
        this.play(next);
      }
      let blend = this.fading ? Math.min(1, next.currentTime / fadeSeconds) : 0;
      if (blend >= 0.98) {
        current.pause();
        current.currentTime = 0;
        this.active = 1 - this.active;
        this.fading = false;
        [current, next] = [next, current];
        blend = 0;
      }

      if (this.keyer) {
        try {
          this.keyer.draw(current, next, blend);
        } catch {
          this.keyer.canvas.remove();
          this.keyer = null;
          this.element.classList.remove('has-keyed-video');
        }
      }
      if (!this.keyer) {
        // Native-video fallback: white visually merges with the white page.
        current.style.zIndex = '0';
        current.style.opacity = '1';
        next.style.zIndex = '1';
        next.style.opacity = String(blend);
      }
      this.element.classList.add('has-flower-video');
    }
  }

  window.CasaBrisaFlowerVideos = (stage) => {
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let players = [];
    let paused = document.hidden;
    function sync() {
      // Do not download decorative videos until motion is actually allowed.
      if (!motion.matches && !players.length) {
        players = Array.from(
          stage.querySelectorAll('[data-flower-video]'),
          (element) => new FlowerVideo(element),
        );
      }
      players.forEach((player) => player.setPaused(paused, motion.matches));
    }
    motion.addEventListener('change', sync);
    document.addEventListener('pointerdown', sync, { once: true, passive: true });
    sync();
    return {
      setPaused(value) {
        paused = value;
        sync();
      },
    };
  };
})();
