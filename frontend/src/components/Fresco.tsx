import hands from '../assets/creation-of-adam-hands.jpg';
import wide1000 from '../assets/creation-of-adam-wide-1000.jpg';
import wide2000 from '../assets/creation-of-adam-wide-2000.jpg';

/** Gilt-framed Creation of Adam: the hands on phones, both figures on wider screens. */
export default function Fresco({ wide = true, className = '' }: { wide?: boolean; className?: string }) {
  return (
    <figure className={'fresco ' + className}>
      <div className="fresco-frame">
        <picture>
          {wide && <source media="(min-width: 720px)" srcSet={`${wide1000} 1000w, ${wide2000} 2000w`} sizes="(min-width: 1320px) 1064px, 90vw" />}
          <img
            src={hands}
            alt={
              wide
                ? 'Michelangelo’s Creation of Adam: Adam and God reach toward each other, fingers almost touching'
                : 'Detail of Michelangelo’s Creation of Adam: two hands about to touch'
            }
            decoding="async"
          />
        </picture>
      </div>
      <figcaption>Michelangelo, The Creation of Adam (detail)</figcaption>
    </figure>
  );
}
