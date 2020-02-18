import React from 'react';
import PropTypes from 'prop-types';
import {
  Text,
} from '@aztec/guacamole-ui';
import styles from './separator.module.scss';

const Separator = ({
  text,
}) => (
  <div
    className={styles.separator}
  >
    <div className={styles['line-left']} />
    <div className="flex-fixed">
      <Text
        text={text}
        size="s"
      />
    </div>
    <div className={styles['line-right']} />
  </div>
);

Separator.propTypes = {
  text: PropTypes.string.isRequired,
};

export default Separator;
