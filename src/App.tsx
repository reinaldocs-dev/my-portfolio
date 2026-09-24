import { useEffect, useRef, type PointerEvent } from 'react'
import astronautSheet from '../example/portrait-astronauta.png'
import './App.css'

type TrailPoint = {
  x: number
  y: number
  t: number
}

const trailLifetime = 1000

function drawRevealBlobs(
  context: CanvasRenderingContext2D,
  trail: TrailPoint[],
  now: number,
  size: number,
) {
  if (!trail.length) return false

  // One compound mask merges overlapping marks without ribbon self-intersections.
  context.fillStyle = '#000'
  context.beginPath()
  for (const point of trail) {
    const age = Math.max(0, (now - point.t) / trailLifetime)
    const envelope = Math.pow(Math.max(0, 1 - age), 0.65)
    const radius = size * 0.095 * envelope
    const phase = point.t * 0.002
    const vertices: Array<[number, number]> = []

    for (let step = 0; step < 32; step += 1) {
      const angle = (step / 32) * Math.PI * 2
      const contour = 1 + 0.18 * Math.sin(angle * 3 + phase) +
        0.1 * Math.cos(angle * 2 - phase)
      vertices.push([
        point.x * size + Math.cos(angle) * radius * contour,
        point.y * size + Math.sin(angle) * radius * contour * 1.15,
      ])
    }

    const first = vertices[0]
    const last = vertices[vertices.length - 1]
    context.moveTo((last[0] + first[0]) / 2, (last[1] + first[1]) / 2)
    vertices.forEach((vertex, index) => {
      const next = vertices[(index + 1) % vertices.length]
      context.quadraticCurveTo(
        vertex[0], vertex[1],
        (vertex[0] + next[0]) / 2, (vertex[1] + next[1]) / 2,
      )
    })
    context.closePath()
  }
  context.fill()
  return true
}

function PortraitReveal({ source }: { source: string }) {
  const portraitRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const trailRef = useRef<TrailPoint[]>([])
  const scheduleRef = useRef<() => void>(() => {})
  const reducedMotionRef = useRef(false)

  useEffect(() => {
    const portrait = portraitRef.current
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    const revealLayer = document.createElement('canvas')
    const revealContext = revealLayer.getContext('2d')

    if (!portrait || !canvas || !context || !revealContext) return

    const image = new Image()
    let frame = 0
    let ready = false

    const render = (now: number) => {
      frame = 0
      if (!ready) return

      const size = canvas.width
      const trail = trailRef.current.filter(
        (point) => now - point.t < trailLifetime,
      )
      trailRef.current = trail

      context.clearRect(0, 0, size, size)
      const sourceWidth = image.naturalWidth / 2
      const sourceHeight = image.naturalHeight

      context.drawImage(
        image,
        0,
        0,
        sourceWidth,
        sourceHeight,
        0,
        0,
        size,
        size,
      )

      revealContext.clearRect(0, 0, size, size)
      revealContext.globalCompositeOperation = 'source-over'
      revealContext.drawImage(
        image,
        sourceWidth,
        0,
        sourceWidth,
        sourceHeight,
        0,
        0,
        size,
        size,
      )
      revealContext.globalCompositeOperation = 'destination-in'

      if (drawRevealBlobs(revealContext, trail, now, size)) {
        revealContext.globalCompositeOperation = 'source-over'
        context.drawImage(revealLayer, 0, 0)
      }

      revealContext.globalCompositeOperation = 'source-over'
      if (trail.length) scheduleRef.current()
    }

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(render)
    }

    const resize = () => {
      const side = Math.min(
        1800,
        Math.ceil(portrait.clientWidth * window.devicePixelRatio),
      )

      if (!side) return

      canvas.width = side
      canvas.height = side
      revealLayer.width = side
      revealLayer.height = side
      schedule()
    }

    const handleLoad = () => {
      ready = true
      resize()
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(portrait)
    window.addEventListener('resize', resize)
    image.addEventListener('load', handleLoad)
    image.src = source

    if (image.complete && image.naturalWidth) handleLoad()

    reducedMotionRef.current = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    scheduleRef.current = schedule

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', resize)
      image.removeEventListener('load', handleLoad)
      if (frame) cancelAnimationFrame(frame)
      scheduleRef.current = () => {}
    }
  }, [source])

  const recordPoint = (x: number, y: number) => {
    const now = performance.now()
    const trail = trailRef.current
    const last = trail[trail.length - 1]

    if (last && now - last.t < 180) {
      const distance = Math.hypot(x - last.x, y - last.y)
      const steps = Math.min(12, Math.ceil(distance / 0.025))

      for (let index = 1; index <= steps; index += 1) {
        const progress = index / steps
        trail.push({
          x: last.x + (x - last.x) * progress,
          y: last.y + (y - last.y) * progress,
          t: last.t + (now - last.t) * progress,
        })
      }
    } else {
      trailRef.current = [...trail.filter((point) => now - point.t < trailLifetime), { x, y, t: now }]
    }

    trailRef.current = trailRef.current.slice(-80)
    scheduleRef.current()
  }

  const recordPointer = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
    const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height))

    recordPoint(x, y)
  }

  const clearOnLeave = () => {
    if (reducedMotionRef.current) trailRef.current = []
    scheduleRef.current()
  }

  return (
    <div
      ref={portraitRef}
      className="portrait"
      role="img"
      aria-label="Astronauta sem capacete. Passe o mouse sobre o retrato para revelar o capacete."
      tabIndex={0}
      onPointerEnter={(event) => {
        if (event.pointerType !== 'touch') recordPointer(event)
      }}
      onPointerMove={(event) => {
        if (event.pointerType === 'touch' && event.buttons === 0) return
        recordPointer(event)
      }}
      onPointerDown={(event) => {
        if (event.pointerType !== 'touch') return

        event.currentTarget.setPointerCapture(event.pointerId)
        recordPointer(event)
      }}
      onPointerLeave={clearOnLeave}
      onPointerUp={(event) => {
        if (event.pointerType !== 'touch') return

        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
        clearOnLeave()
      }}
      onPointerCancel={clearOnLeave}
      onFocus={(event) => {
        if (event.currentTarget.matches(':focus-visible')) recordPoint(0.5, 0.5)
      }}
      onBlur={clearOnLeave}
    >
      <canvas ref={canvasRef} className="portrait-canvas" aria-hidden="true" />
    </div>
  )
}

function App() {
  return (
    <main className="portfolio">
    <section className="hero" id="hero" aria-labelledby="hero-title">
      <header className="site-header">
        <a className="wordmark" href="#hero" aria-label="Reinaldo Correia — início">Reinaldo.dev</a>
        <nav className="header-nav" aria-label="Navegação principal">
          <a href="#projetos">Projetos</a>
          <a href="#sobre">Sobre</a>
          <a href="#competencias">Competências</a>
        </nav>
        <a className="contact-link header-contact" href="#contato">Vamos conversar</a>
      </header>
      <h1 className="hero-name" id="hero-title"><span>REINALDO</span> CORREIA</h1>
      <PortraitReveal source={astronautSheet} />
      <section className="intro" aria-labelledby="hero-title">
        <span className="eyebrow">DESENVOLVEDOR</span>
        <h2>Full Stack Sênior.</h2>
        <p className="hero-description">Da interface à infraestrutura.<br />Produtos digitais de ponta a ponta.</p>
        <div className="hero-actions">
          <a className="contact-link" href="mailto:reinaldocorreiaweb@gmail.com">Entre em contato</a>
        </div>
      </section>
      <nav className="social-links" aria-label="Redes e contato">
        <a href="https://github.com/reinaldocs-dev" target="_blank" rel="noreferrer">GitHub</a>
        <a href="https://www.linkedin.com/in/reinaldo-correia" target="_blank" rel="noreferrer">LinkedIn</a>
        <a href="mailto:reinaldocorreiaweb@gmail.com">E-mail</a>
      </nav>
      <footer className="site-footer">
        <span className="footnote">REACT · TYPESCRIPT · NODE.JS · PYTHON</span>
        <p className="interaction">Explore o retrato. Revele o capacete.</p>
        <span className="index">SÃO PAULO, BRASIL</span>
      </footer>
    </section>

    <section className="content-section projects-section" id="projetos" aria-labelledby="projects-title">
      <div className="section-topline"><span>01 / TRABALHOS EM DESTAQUE</span><span>CREATIVE TECH · SAAS · IA</span></div>
      <div className="section-heading-row">
        <h2 className="display-heading" id="projects-title">Ideias que<br /><em>ganham escala.</em></h2>
        <p>Do produto à infraestrutura: uma seleção do trabalho que desenvolvo na Galeria.Holding.</p>
      </div>
      <div className="project-grid">
        <article className="project-card project-card-dark">
          <div className="project-card-top"><span>PROJETO / 01</span><span>GALERIA.HOLDING</span></div>
          <div className="project-visual cria-visual" aria-hidden="true">
            <span className="visual-overline">CR.IA / RENDER ENGINE</span>
            <div className="render-flow"><span>HTML</span><i /><span>RENDER</span><i /><span>IMAGEM<br />VÍDEO</span></div>
            <span className="visual-coordinate">CLOUD RUN · PUB/SUB · STORAGE</span>
          </div>
          <div className="project-card-body">
            <div><span className="project-kicker">PLATAFORMA DE CRIAÇÃO & RENDERIZAÇÃO</span><h3>CR.IA</h3></div>
            <p>Concebi e desenvolvi uma engine própria de renderização em HTML para substituir uma solução terceirizada. Com o time, evoluí o pipeline de peças em imagem e vídeo e sua arquitetura distribuída na Google Cloud, ampliando a flexibilidade para novos formatos, incluindo mídia OOH.</p>
          </div>
          <div className="project-tags"><span>TypeScript</span><span>Python</span><span>Puppeteer</span><span>FFmpeg</span><span>GCP</span></div>
        </article>

        <article className="project-card project-card-light">
          <div className="project-card-top"><span>PROJETO / 02</span><span>GALERIA.HOLDING</span></div>
          <div className="project-visual brand-visual" aria-hidden="true">
            <span className="visual-overline">BRANDSYNC / CONTENT FLOW</span>
            <div className="brand-orbit"><span className="orbit-center">BRAND<br />SYNC</span><span className="orbit-node orbit-node-one">META</span><span className="orbit-node orbit-node-two">DADOS</span><span className="orbit-node orbit-node-three">CONTEÚDO</span></div>
            <span className="visual-coordinate">INGESTÃO · ANÁLISE · DISTRIBUIÇÃO</span>
          </div>
          <div className="project-card-body">
            <div><span className="project-kicker">INTELIGÊNCIA DE CONTEÚDO</span><h3>BrandSync</h3></div>
            <p>Contribuo para a evolução da plataforma com integrações com a Meta, ingestão automática de publicações do Instagram e fluxos de postagem manual ou automatizada, conectando dados e operações de conteúdo.</p>
          </div>
          <div className="project-tags"><span>React</span><span>TypeScript</span><span>APIs REST</span><span>Meta</span></div>
        </article>
      </div>
      <p className="section-note">Projetos desenvolvidos em equipe na Galeria.Holding. Diagramas ilustrativos; interfaces e dados de clientes não são exibidos.</p>
    </section>

    <section className="content-section about-section" id="sobre" aria-labelledby="about-title">
      <div className="section-topline"><span>02 / SOBRE MIM</span><span>DA QUALIDADE À ENGENHARIA</span></div>
      <div className="about-grid">
        <div>
          <h2 className="display-heading" id="about-title">Eu gosto de<br /><em>entender o todo.</em></h2>
          <p className="about-lead">Sou desenvolvedor Full Stack Sênior. Trabalho na interseção entre produto, engenharia e infraestrutura, criando experiências digitais que funcionam bem da interface à produção.</p>
        </div>
        <div className="about-detail">
          <p>Comecei em Qualidade de Software, com testes manuais e automação. Essa origem moldou meu olhar para critérios de aceite, testabilidade e prevenção de falhas — e segue presente em cada sistema que construo.</p>
          <p>Na NTT DATA, passei de QA para engenharia de software. Hoje, na Galeria.Holding, atuo de ponta a ponta em produtos de Creative Tech, SaaS e IA, além de apoiar outros desenvolvedores, revisar código e solucionar problemas em produção.</p>
          <div className="journey">
            <div className="journey-item"><span>2025 — ATUAL</span><strong>Galeria.Holding</strong><small>Especialista em desenvolvimento · CR.IA e BrandSync</small></div>
            <div className="journey-item"><span>2022 — 2024</span><strong>NTT DATA</strong><small>Engenheiro de software</small></div>
            <div className="journey-item"><span>2020 — 2022</span><strong>NTT DATA</strong><small>Analista de testes / QA</small></div>
          </div>
        </div>
      </div>
    </section>

    <section className="content-section skills-section" id="competencias" aria-labelledby="skills-title">
      <div className="section-topline"><span>03 / COMPETÊNCIAS</span><span>DA IDEIA AO DEPLOY</span></div>
      <div className="section-heading-row">
        <h2 className="display-heading" id="skills-title">Uma stack.<br /><em>Várias camadas.</em></h2>
        <p>Ferramentas que uso para conectar experiência, serviços, automação e operação.</p>
      </div>
      <div className="skills-grid">
        <div className="skill-group"><span className="skill-index">01 / INTERFACES</span><h3>Frontend</h3><p>React.js, TypeScript, JavaScript, HTML e CSS</p></div>
        <div className="skill-group"><span className="skill-index">02 / SERVIÇOS</span><h3>Backend & dados</h3><p>Node.js, Python, Flask, FastAPI, APIs REST e PostgreSQL</p></div>
        <div className="skill-group"><span className="skill-index">03 / PLATAFORMA</span><h3>Cloud & entrega</h3><p>Google Cloud, Cloud Run, Pub/Sub, Cloud SQL, Cloud Storage, Docker e CI/CD</p></div>
        <div className="skill-group"><span className="skill-index">04 / AUTOMAÇÃO</span><h3>Render & qualidade</h3><p>Puppeteer, FFmpeg, GSAP, automação de testes e code review</p></div>
      </div>
    </section>

    <section className="content-section contact-section" id="contato" aria-labelledby="contact-title">
      <div className="section-topline"><span>04 / CONTATO</span><span>O PRÓXIMO PROJETO COMEÇA AQUI</span></div>
      <div className="contact-content">
        <p className="contact-eyebrow">TEM UMA IDEIA OU UM DESAFIO?</p>
        <h2 className="display-heading" id="contact-title">Vamos fazer<br /><em>acontecer.</em></h2>
        <a className="contact-email" href="mailto:reinaldocorreiaweb@gmail.com">reinaldocorreiaweb@gmail.com <span aria-hidden="true">↗</span></a>
      </div>
      <footer className="page-footer">
        <a href="#hero" className="footer-brand">Reinaldo.dev <span aria-hidden="true">↑</span></a>
        <span>FRANCO DA ROCHA · SP · BRASIL</span>
        <div><a href="https://github.com/reinaldocs-dev" target="_blank" rel="noreferrer">GitHub</a><a href="https://www.linkedin.com/in/reinaldo-correia" target="_blank" rel="noreferrer">LinkedIn</a></div>
      </footer>
    </section>
    </main>
  )
}

export default App
