import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowRight, Check, Headset, Layers, LockKeyhole, MessageCircle, ShieldCheck, Sparkles, Store, Truck } from "lucide-react";
import { submitLead } from "./lead-submit.js";
import { onPhoneInput, onCNPJInput, validateCNPJField, validatePhoneField } from "./masks.js";
import "./styles.css";

const benefits = [
  [Layers, "Grandes marcas", "Mais opções para sua vitrine"],
  [Sparkles, "Variedade de modelos", "Um mix para o seu público"],
  [Truck, "Frete grátis*", "Mais vantagem na sua compra"],
  [Headset, "Atendimento comercial", "Converse com um consultor"],
];

function LeadForm() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const phoneValid = validatePhoneField(form.querySelector('input[name="numero"]'));
    const cnpjValid = validateCNPJField(form.querySelector('input[name="cnpj"]'));
    if (!phoneValid || !cnpjValid || !form.reportValidity() || submitting || submitted) return;
    setSubmitting(true);
    setSubmissionError("");
    try {
      await submitLead(new FormData(form));
      setSubmitted(true);
    } catch (error) {
      setSubmissionError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div id="cadastro" className="form-card" tabIndex={-1}>
      <div className="form-banner"><MessageCircle size={16} aria-hidden="true" /> SEU PRÓXIMO PEDIDO COMEÇA AQUI</div>
      {submitted ? (
        <div className="confirmation" role="status" aria-live="polite">
          <span className="confirmation-icon"><Check size={28} aria-hidden="true" /></span>
          <h2>Solicitação recebida!</h2>
          <p>Um consultor GOL entrará em contato para apresentar o catálogo e as condições de compra para sua loja.</p>
          <span className="confirmation-note">Obrigado por escolher a GOL Distribuidora.</span>
        </div>
      ) : (
        <form className="form-body" onSubmit={handleSubmit} aria-labelledby="form-title" aria-busy={submitting}>
          <span className="section-label">CATÁLOGO PARA LOJISTAS</span>
          <h2 id="form-title">Seu novo mix<br /> está a um passo.</h2>
          <p className="form-description">Deixe seus dados para conhecer os calçados disponíveis e negociar com um consultor GOL.</p>
          <div className="form-grid">
            <label className="full" htmlFor="nome">Seu nome<input id="nome" name="nome" autoComplete="name" required placeholder="Como podemos te chamar?" disabled={submitting} /></label>
            <label htmlFor="numero">WhatsApp com DDD<input id="numero" name="numero" type="tel" autoComplete="tel-national" required inputMode="tel" placeholder="(00) 00000-0000" maxLength={15} onInput={onPhoneInput} onBlur={e => validatePhoneField(e.currentTarget)} disabled={submitting} /></label>
            <label htmlFor="cnpj">CNPJ da sua loja<input id="cnpj" name="cnpj" required inputMode="numeric" placeholder="00.000.000/0000-00" maxLength={18} onInput={onCNPJInput} onBlur={e => validateCNPJField(e.currentTarget)} disabled={submitting} /></label>
          </div>
          <label className="consent"><input required type="checkbox" disabled={submitting} /><span>Concordo em receber contato da GOL Distribuidora sobre o catálogo e as condições comerciais.</span></label>
          {submissionError && <p className="form-error" role="alert">{submissionError}</p>}
          <button className="button full-button" type="submit" disabled={submitting}>{submitting ? "Enviando solicitação..." : "Quero receber o catálogo"}{!submitting && <ArrowRight size={19} aria-hidden="true" />}</button>
          <p className="form-note"><LockKeyhole size={13} aria-hidden="true" /> Seus dados serão usados para atendimento comercial.</p>
        </form>
      )}
      <div className="form-footer"><ShieldCheck size={18} aria-hidden="true" /><span>Atendimento exclusivo para <strong>empresas com CNPJ.</strong></span></div>
    </div>
  );
}

function App() {
  return (
    <main id="top">
      <header className="site-header">
        <span className="header-caption">CALÇADOS NO ATACADO</span>
        <a className="brand" href="#top" aria-label="GOL Distribuidora, início"><img src="/gol-distribuidora.webp" alt="GOL Distribuidora" width="96" height="70" /></a>
        <a className="header-link" href="#cadastro"><span className="header-link-desktop">Vamos abastecer sua loja</span><span className="header-link-mobile">Catálogo</span><ArrowRight size={16} aria-hidden="true" /></a>
      </header>
      <section className="hero" aria-labelledby="hero-title">
        <div className="decorative-circles" aria-hidden="true" />
        <div className="hero-content">
          <div className="copy">
            <div className="eyebrow"><span /> PARCERIA PARA QUEM VENDE CALÇADOS</div>
            <h1 id="hero-title">GRANDES MARCAS.<br />SUA LOJA PRONTA<br />PARA <em>VENDER MAIS.</em></h1>
            <p>Abasteça sua loja com calçados de grandes marcas. <strong>Receba o catálogo</strong> e descubra as opções e condições de compra para o seu negócio.</p>
            <ul className="benefits" aria-label="Vantagens de comprar com a GOL">
              {benefits.map(([Icon, title, description]) => <li key={title}><span className="benefit-icon"><Icon size={21} strokeWidth={1.8} aria-hidden="true" /></span><span><strong>{title}</strong><small>{description}</small></span></li>)}
            </ul>
            <a className="button hero-button" href="#cadastro">Quero conhecer o catálogo <ArrowRight size={19} aria-hidden="true" /></a>
            <p className="shipping-note">*Consulte regiões e condições de frete grátis com o consultor.</p>
          </div>
          <div className="form-wrap"><LeadForm /></div>
        </div>
        <div className="hero-signature"><Store size={16} aria-hidden="true" /><span>GOL DISTRIBUIDORA</span><i /> Grandes marcas. Uma parceria para sua loja.</div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
