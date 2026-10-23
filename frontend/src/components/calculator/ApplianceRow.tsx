import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { cn } from '../../lib/cn';
import { Icon } from '../icons/Icon';
import { Stepper } from './Stepper';
import { NumberField } from './NumberField';
import { applianceDailyWh } from './useSolarEstimate';
import { fmt, useLanguage } from '../../i18n/LanguageProvider';
import {
  applianceCatalog,
  findApplianceByName,
  findApplianceDefaults,
  withApplianceKind,
  type Appliance,
} from '../../data/content';

type FieldKey = 'watts' | 'units' | 'hours';
const FIELD_ORDER: FieldKey[] = ['watts', 'units', 'hours'];

/**
 * One electrical load.
 *
 * Cause and effect stay on one line: the steppers on the reading-start side,
 * the resulting daily energy at the end, so changing hours visibly moves the
 * number beside it rather than only the totals further down. On phones the
 * steppers drop to their own full-width line under the name.
 *
 * The name is a button on every row: clicking it opens a field with the
 * catalog names as suggestions. Picking one applies that device's defaults;
 * any other text is only a label and leaves the values alone.
 */
export function ApplianceRow({
  appliance,
  active,
  onChange,
  onFocus,
  onRemove,
}: {
  appliance: Appliance;
  active: boolean;
  onChange: (next: Appliance) => void;
  onFocus: () => void;
  onRemove: () => void;
}) {
  const { t, pick } = useLanguage();
  const daily = applianceDailyWh(appliance);
  const name = pick(appliance.name) || t('row.unnamed');

  const unitsOf = t('row.unitsOf', { n: name });
  const hoursOf = t('row.hoursOf', { n: name });

  const [errors, setErrors] = useState<Partial<Record<FieldKey, string | null>>>({});
  const setError = (field: FieldKey) => (message: string | null) =>
    setErrors((prev) => (prev[field] === message ? prev : { ...prev, [field]: message }));
  const firstError = FIELD_ORDER.map((field) => errors[field]).find(Boolean);

  return (
    <li
      onFocusCapture={onFocus}
      onMouseEnter={onFocus}
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[12px] border px-3 py-2.5 transition-colors',
        active
          ? 'border-[1.5px] border-line-brand bg-bg-panel-raised'
          : 'border-line-on-dark bg-bg-panel-deep',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-bg-panel-raised',
          active ? 'text-solar-300' : 'text-dusk-200',
        )}
      >
        <Icon name={appliance.icon} size={18} />
      </span>

      <div className="min-w-[5.5rem] flex-1 sm:min-w-[7rem]">
        <ApplianceName appliance={appliance} name={name} onChange={onChange} />
        <p className="whitespace-nowrap text-label-sm text-content-on-dark-muted">
          <span className="inline-flex rounded-md border border-transparent transition-colors focus-within:border-line-brand">
            <NumberField
              value={appliance.watts}
              max={20000}
              label={t('row.watts', { n: name })}
              onErrorChange={setError('watts')}
              onChange={(watts) => onChange({ ...appliance, watts })}
              className="w-12 text-label-sm text-content-on-dark-muted focus:text-content-on-dark ltr:text-left rtl:text-right"
            />
          </span>{' '}
          {t('row.each')}
        </p>
      </div>

      <div className="order-last flex w-full gap-3 sm:order-none sm:w-auto">
        <Stepper
          label={t('row.units')}
          fullLabel={unitsOf}
          valueLabel={t('row.valueOf', { n: unitsOf })}
          value={appliance.units}
          min={0}
          max={40}
          integer
          voiceGuide={`الرجاء تحديد عدد أجهزة ${name} التي ترغب في تشغيلها.`}
          decreaseLabel={t('row.decrease', { n: unitsOf })}
          increaseLabel={t('row.increase', { n: unitsOf })}
          onErrorChange={setError('units')}
          onChange={(units) => onChange({ ...appliance, units })}
        />

        <Stepper
          label={t('row.hours')}
          fullLabel={hoursOf}
          valueLabel={t('row.valueOf', { n: hoursOf })}
          value={appliance.hours}
          min={0}
          max={24}
          maxMessage="val.hoursMax"
          voiceGuide={`الرجاء تحديد عدد ساعات تشغيل ${name} يومياً.`}
          decreaseLabel={t('row.decrease', { n: hoursOf })}
          increaseLabel={t('row.increase', { n: hoursOf })}
          onErrorChange={setError('hours')}
          onChange={(hours) => onChange({ ...appliance, hours })}
        />
      </div>

      <div className="min-w-[4.5rem] shrink-0 text-end sm:min-w-20">
        <p className={cn('numeric whitespace-nowrap text-label', active ? 'text-solar-300' : 'text-content-on-dark')}>
          {fmt.int(daily)} Wh
        </p>
        <p className="text-label-sm text-content-on-dark-muted">{t('row.perDay')}</p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('row.remove', { n: name })}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-content-on-dark-muted transition-colors hover:bg-bg-panel-raised hover:text-content-on-dark"
      >
        <Icon name="x-mark" size={16} />
      </button>

      {firstError && (
        <p role="alert" className="order-last w-full text-label-sm text-danger-300">
          {firstError}
        </p>
      )}
    </li>
  );
}

/** The row's name: plain text on a button, turning into a field with suggestions. */
function ApplianceName({
  appliance,
  name,
  onChange,
}: {
  appliance: Appliance;
  name: string;
  onChange: (next: Appliance) => void;
}) {
  const { t, pick } = useLanguage();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  // Enter closes the field, and the field's blur on the way out must not
  // apply the same text a second time.
  const editingRef = useRef(false);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const open = () => {
    setDraft(pick(appliance.name));
    editingRef.current = true;
    setEditing(true);
  };

  const finish = (text: string) => {
    if (!editingRef.current) return;
    editingRef.current = false;
    setEditing(false);
    const typed = text.trim();
    const kindDefaults = findApplianceDefaults(appliance.kind);

    if (!typed) {
      onChange({
        ...appliance,
        name: kindDefaults ? { ...kindDefaults.name } : { en: '', ar: '' },
        nameEdited: false,
      });
      return;
    }

    const match = findApplianceByName(typed);
    if (match && match.id !== appliance.kind) {
      onChange(withApplianceKind(appliance, match.id));
      return;
    }
    if (match) {
      onChange({ ...appliance, name: { ...match.name }, nameEdited: false });
      return;
    }
    if (typed !== pick(appliance.name)) {
      onChange({ ...appliance, name: { en: typed, ar: typed }, nameEdited: true });
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setDraft(text);
    // A suggestion picked from the list arrives as one replacement, not as
    // typed letters, so "Laptop stand" never applies "Laptop" on the way.
    const inputType = (e.nativeEvent as InputEvent).inputType;
    if (!inputType || inputType === 'insertReplacementText') {
      const match = findApplianceByName(text);
      if (match) {
        editingRef.current = false;
        setEditing(false);
        onChange(
          match.id === appliance.kind
            ? { ...appliance, name: { ...match.name }, nameEdited: false }
            : withApplianceKind(appliance, match.id),
        );
      }
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={open}
        aria-label={t('row.rename', { n: name })}
        className="block max-w-full truncate text-start text-label text-content-on-dark decoration-dotted underline-offset-4 hover:underline"
      >
        {name}
      </button>
    );
  }

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        list={listId}
        value={draft}
        aria-label={t('row.name')}
        placeholder={t('row.namePh')}
        autoComplete="off"
        onChange={handleChange}
        onBlur={(e) => finish(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Escape') {
            e.preventDefault();
            finish(e.currentTarget.value);
          }
        }}
        className="w-full min-w-0 rounded-md border border-line-brand bg-bg-panel-raised px-2 py-0.5 text-label text-content-on-dark outline-none placeholder:text-content-on-dark-muted"
      />
      <datalist id={listId}>
        {applianceCatalog.map((entry) => (
          <option key={entry.id} value={pick(entry.name)} />
        ))}
      </datalist>
    </>
  );
}
